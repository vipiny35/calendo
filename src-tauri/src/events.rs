//! Read-only integration with the user's macOS calendars.

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingEvent {
    pub id: String,
    pub title: String,
    pub start_at: i64,
    pub end_at: i64,
    pub calendar: Option<String>,
    pub location: Option<String>,
    pub join_url: Option<String>,
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn request_access(store: &objc2_event_kit::EKEventStore) {
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_event_kit::EKEntityType;

    let completion = RcBlock::new(|_: Bool, _: *mut objc2_foundation::NSError| {});
    unsafe {
        // Deprecated on macOS 14, but still the compatible request path for
        // Calendo's macOS 13 minimum deployment target.
        store.requestAccessToEntityType_completion(
            EKEntityType::Event,
            RcBlock::into_raw(completion),
        );
    }
}

#[cfg(target_os = "macos")]
fn ns_string(value: &objc2_foundation::NSString) -> String {
    value.to_string()
}

#[cfg(target_os = "macos")]
fn first_url(value: &str) -> Option<String> {
    value
        .split_whitespace()
        .map(|token| {
            token.trim_matches(|character: char| {
                matches!(character, '(' | ')' | '[' | ']' | '<' | '>' | ',' | ';')
            })
        })
        .find(|token| token.starts_with("https://") || token.starts_with("http://"))
        .map(str::to_owned)
}

#[cfg(target_os = "macos")]
fn fetch_macos() -> Result<Option<UpcomingEvent>, String> {
    use objc2::rc::autoreleasepool;
    use objc2::rc::Retained;
    use objc2::AnyThread;
    use objc2_event_kit::{EKAuthorizationStatus, EKCalendar, EKEntityType, EKEventStore};
    use objc2_foundation::{NSDate, NSURL};

    autoreleasepool(|_| {
        let status = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
        if status == EKAuthorizationStatus::NotDetermined {
            return Ok(None);
        }
        if status != EKAuthorizationStatus::FullAccess {
            return Err("Calendar access is not enabled".into());
        }

        let store = unsafe { EKEventStore::init(EKEventStore::alloc()) };
        let now = NSDate::now();
        let horizon = NSDate::dateWithTimeIntervalSinceNow(7.0 * 24.0 * 60.0 * 60.0);
        let predicate = unsafe {
            store.predicateForEventsWithStartDate_endDate_calendars(&now, &horizon, None)
        };
        let events = unsafe { store.eventsMatchingPredicate(&predicate) };
        let now_seconds = now.timeIntervalSince1970();

        let mut selected: Option<(f64, UpcomingEvent)> = None;
        for index in 0..events.count() {
            let event = events.objectAtIndex(index);
            let start = unsafe { event.startDate().timeIntervalSince1970() };
            let end = unsafe { event.endDate().timeIntervalSince1970() };
            if unsafe { event.isAllDay() } || end <= now_seconds || end <= start {
                continue;
            }
            if unsafe { event.status() } == objc2_event_kit::EKEventStatus::Canceled {
                continue;
            }

            let title_obj = unsafe { event.title() };
            let title = ns_string(&title_obj);
            let location: Option<String> =
                unsafe { event.location() }.map(|value| ns_string(&value));
            let notes: Option<String> = unsafe { event.notes() }.map(|value| ns_string(&value));
            let raw_url: Option<Retained<NSURL>> = unsafe { event.URL() };
            let event_url: Option<String> = match raw_url {
                Some(value) => value.absoluteString().map(|value| ns_string(&value)),
                None => None,
            };
            let join_url = event_url
                .as_deref()
                .and_then(first_url)
                .or_else(|| location.as_deref().and_then(first_url))
                .or_else(|| notes.as_deref().and_then(first_url));
            let raw_calendar: Option<Retained<EKCalendar>> = unsafe { event.calendar() };
            let calendar: Option<String> = raw_calendar.map(|value| {
                let title = unsafe { value.title() };
                ns_string(&title)
            });
            let id = unsafe { event.eventIdentifier() }
                .map(|value| ns_string(&value))
                .unwrap_or_else(|| format!("{start:.3}-{end:.3}-{title}"));
            let candidate = UpcomingEvent {
                id,
                title: if title.is_empty() {
                    "Untitled event".into()
                } else {
                    title
                },
                start_at: (start * 1000.0) as i64,
                end_at: (end * 1000.0) as i64,
                calendar,
                location: location.filter(|value| !value.is_empty()),
                join_url,
            };
            if selected
                .as_ref()
                .map_or(true, |(earliest, _)| start < *earliest)
            {
                selected = Some((start, candidate));
            }
        }
        Ok(selected.map(|(_, event)| event))
    })
}

#[cfg(target_os = "macos")]
pub fn request_access_if_needed() -> Result<bool, String> {
    use objc2::rc::autoreleasepool;
    use objc2::AnyThread;
    use objc2_event_kit::{EKAuthorizationStatus, EKEntityType, EKEventStore};

    Ok(autoreleasepool(|_| {
        let status = unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) };
        if status == EKAuthorizationStatus::NotDetermined {
            let store = unsafe { EKEventStore::init(EKEventStore::alloc()) };
            request_access(&store);
            false
        } else {
            status == EKAuthorizationStatus::FullAccess
        }
    }))
}

pub fn fetch_upcoming() -> Result<Option<UpcomingEvent>, String> {
    #[cfg(target_os = "macos")]
    {
        fetch_macos()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(None)
    }
}

#[cfg(not(target_os = "macos"))]
pub fn request_access_if_needed() -> Result<bool, String> {
    Ok(false)
}

#[cfg(target_os = "macos")]
pub fn open_meeting(url: &str) -> Result<(), String> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::{NSString, NSURL};

    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Meeting link must use http or https".into());
    }
    let string = NSString::from_str(url);
    let Some(url) = NSURL::URLWithString(&string) else {
        return Err("Invalid meeting link".into());
    };
    if NSWorkspace::sharedWorkspace().openURL(&url) {
        Ok(())
    } else {
        Err("Could not open meeting link".into())
    }
}

#[cfg(not(target_os = "macos"))]
pub fn open_meeting(_url: &str) -> Result<(), String> {
    Err("Meeting links are only supported on macOS".into())
}
