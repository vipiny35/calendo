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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum AccessAction {
    Granted,
    RequestPrompt,
    OpenSettings,
}

/// EventKit authorizationStatus values: NotDetermined=0, Restricted=1,
/// Denied=2, FullAccess/Authorized=3, WriteOnly=4.
///
/// WriteOnly still needs a full-access prompt. Denied/Restricted cannot
/// prompt again, so those go to System Settings.
pub(crate) fn access_action(status: isize) -> AccessAction {
    match status {
        0 | 4 => AccessAction::RequestPrompt,
        3 => AccessAction::Granted,
        _ => AccessAction::OpenSettings,
    }
}

pub(crate) fn access_granted(status: isize) -> bool {
    matches!(access_action(status), AccessAction::Granted)
}

/// EventKit often keeps `authorizationStatus` on Denied and
/// `calendarsForEntityType` empty until the next launch. A successful prompt
/// in this process is enough to try reading events.
pub(crate) fn can_fetch_events(status: isize, granted_this_session: bool) -> bool {
    granted_this_session || access_granted(status)
}

pub(crate) const CALENDAR_PRIVACY_URLS: &[&str] = &[
    "x-apple.systempreferences:com.apple.Settings.PrivacySecurity.extension?Privacy_Calendars",
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Calendars",
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
];

#[cfg(target_os = "macos")]
mod macos {
    use super::{
        access_action, access_granted, can_fetch_events, AccessAction, UpcomingEvent,
        CALENDAR_PRIVACY_URLS,
    };
    use block2::RcBlock;
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::runtime::Bool;
    use objc2::{available, AnyThread};
    use objc2_app_kit::{NSApplication, NSWorkspace};
    use objc2_event_kit::{EKCalendar, EKEntityType, EKEventStore};
    use objc2_foundation::{MainThreadMarker, NSDate, NSString, NSURL};
    use std::cell::RefCell;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;

    thread_local! {
        static STORE: RefCell<Option<Retained<EKEventStore>>> = const { RefCell::new(None) };
    }
    static SESSION_GRANTED: AtomicBool = AtomicBool::new(false);
    static NEEDS_RESET: AtomicBool = AtomicBool::new(false);

    fn require_main_thread() {
        assert!(
            MainThreadMarker::new().is_some(),
            "EventKit must run on the main thread"
        );
    }

    fn status_code() -> isize {
        unsafe { EKEventStore::authorizationStatusForEntityType(EKEntityType::Event) }.0
    }

    fn new_store() -> Retained<EKEventStore> {
        unsafe { EKEventStore::init(EKEventStore::alloc()) }
    }

    fn event_store() -> Retained<EKEventStore> {
        require_main_thread();
        STORE.with(|slot| {
            if slot.borrow().is_none() {
                *slot.borrow_mut() = Some(new_store());
            }
            slot.borrow().clone().expect("calendar store")
        })
    }

    pub fn refresh_after_access_change() {
        require_main_thread();
        STORE.with(|slot| {
            if let Some(store) = slot.borrow().as_ref() {
                unsafe {
                    store.reset();
                    store.refreshSourcesIfNecessary();
                }
            }
        });
        NEEDS_RESET.store(false, Ordering::SeqCst);
    }

    fn mark_granted() {
        SESSION_GRANTED.store(true, Ordering::SeqCst);
        NEEDS_RESET.store(true, Ordering::SeqCst);
    }

    fn granted_this_session() -> bool {
        SESSION_GRANTED.load(Ordering::SeqCst)
    }

    pub fn finish_access_request(granted: bool) {
        require_main_thread();
        if granted {
            mark_granted();
        }
        refresh_after_access_change();
    }

    fn activate_app() {
        let Some(marker) = MainThreadMarker::new() else {
            return;
        };
        let app = NSApplication::sharedApplication(marker);
        #[allow(deprecated)]
        app.activateIgnoringOtherApps(true);
    }

    fn open_calendar_privacy_settings() -> Result<(), String> {
        let workspace = NSWorkspace::sharedWorkspace();
        for url in CALENDAR_PRIVACY_URLS {
            let Some(target) = NSURL::URLWithString(&NSString::from_str(url)) else {
                continue;
            };
            if workspace.openURL(&target) {
                return Ok(());
            }
        }
        Err("Could not open Calendar privacy settings".into())
    }

    fn request_access(
        store: Retained<EKEventStore>,
        reply: impl FnOnce(Result<bool, String>) + Send + 'static,
    ) {
        let reply = Mutex::new(Some(reply));
        let completion = RcBlock::new(move |granted: Bool, error: *mut objc2_foundation::NSError| {
            let result = if let Some(error) = unsafe { error.as_ref() } {
                Err(error.localizedDescription().to_string())
            } else {
                Ok(granted.as_bool())
            };
            if matches!(result, Ok(true)) {
                mark_granted();
            }
            if let Some(reply) = reply.lock().ok().and_then(|mut slot| slot.take()) {
                reply(result);
            }
        });
        unsafe {
            #[allow(deprecated)]
            if available!(macos = 14.0) {
                store.requestFullAccessToEventsWithCompletion(RcBlock::as_ptr(&completion));
            } else {
                store.requestAccessToEntityType_completion(
                    EKEntityType::Event,
                    RcBlock::as_ptr(&completion),
                );
            }
        }
        // EventKit copies escaping completion handlers; keep our retain until then.
        std::mem::forget(completion);
    }

    pub fn begin_access_request(reply: impl FnOnce(Result<bool, String>) + Send + 'static) {
        require_main_thread();
        match access_action(status_code()) {
            AccessAction::Granted => {
                mark_granted();
                reply(Ok(true));
            }
            AccessAction::OpenSettings => {
                activate_app();
                reply(open_calendar_privacy_settings().map(|()| false));
            }
            AccessAction::RequestPrompt => {
                activate_app();
                request_access(event_store(), reply);
            }
        }
    }

    pub fn has_access() -> bool {
        require_main_thread();
        if can_fetch_events(status_code(), granted_this_session()) {
            return true;
        }
        refresh_after_access_change();
        if access_granted(status_code()) {
            mark_granted();
            return true;
        }
        false
    }

    fn ns_string(value: &NSString) -> String {
        value.to_string()
    }

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

    pub fn fetch_macos_range(start_ms: i64, end_ms: i64) -> Result<Vec<UpcomingEvent>, String> {
        require_main_thread();
        autoreleasepool(|_| {
            let store = event_store();
            if NEEDS_RESET.load(Ordering::SeqCst) {
                unsafe {
                    store.reset();
                    store.refreshSourcesIfNecessary();
                }
                NEEDS_RESET.store(false, Ordering::SeqCst);
            } else {
                unsafe { store.refreshSourcesIfNecessary() };
            }
            if !can_fetch_events(status_code(), granted_this_session()) {
                return Err("Calendar access is not enabled".into());
            }
            let start = NSDate::dateWithTimeIntervalSince1970(start_ms as f64 / 1000.0);
            let end = NSDate::dateWithTimeIntervalSince1970(end_ms as f64 / 1000.0);
            let predicate = unsafe {
                store.predicateForEventsWithStartDate_endDate_calendars(&start, &end, None)
            };
            let events = unsafe { store.eventsMatchingPredicate(&predicate) };
            let mut found = Vec::new();
            for index in 0..events.count() {
                let event = events.objectAtIndex(index);
                let start = unsafe { event.startDate().timeIntervalSince1970() };
                let end = unsafe { event.endDate().timeIntervalSince1970() };
                if unsafe { event.isAllDay() } || end <= start {
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
                found.push(UpcomingEvent {
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
                });
            }
            found.sort_by_key(|event| event.start_at);
            Ok(found)
        })
    }

    pub fn fetch_macos() -> Result<Option<UpcomingEvent>, String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?;
        let start_ms = now.as_millis() as i64;
        let end_ms = start_ms.saturating_add(7 * 24 * 60 * 60 * 1000);
        Ok(fetch_macos_range(start_ms, end_ms)?.into_iter().next())
    }

    pub fn open_meeting(url: &str) -> Result<(), String> {
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
}

#[cfg(target_os = "macos")]
pub fn finish_access_request(granted: bool) {
    macos::finish_access_request(granted);
}

#[cfg(not(target_os = "macos"))]
pub fn finish_access_request(_granted: bool) {}

#[cfg(target_os = "macos")]
pub fn begin_access_request(reply: impl FnOnce(Result<bool, String>) + Send + 'static) {
    macos::begin_access_request(reply);
}

#[cfg(not(target_os = "macos"))]
pub fn begin_access_request(reply: impl FnOnce(Result<bool, String>) + Send + 'static) {
    reply(Ok(false));
}

pub fn fetch_upcoming() -> Result<Option<UpcomingEvent>, String> {
    #[cfg(target_os = "macos")]
    {
        macos::fetch_macos()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(None)
    }
}

pub fn has_access() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos::has_access()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

pub fn fetch_range(start_ms: i64, end_ms: i64) -> Result<Vec<UpcomingEvent>, String> {
    #[cfg(target_os = "macos")]
    {
        if end_ms <= start_ms {
            return Ok(Vec::new());
        }
        macos::fetch_macos_range(start_ms, end_ms)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (start_ms, end_ms);
        Ok(Vec::new())
    }
}

pub fn open_meeting(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::open_meeting(url)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = url;
        Err("Meeting links are only supported on macOS".into())
    }
}

#[cfg(test)]
mod tests {
    use super::{access_action, access_granted, can_fetch_events, AccessAction, CALENDAR_PRIVACY_URLS};

    #[test]
    fn full_access_and_the_legacy_authorized_alias_are_granted() {
        assert!(access_granted(3));
        assert_eq!(access_action(3), AccessAction::Granted);
    }

    #[test]
    fn write_only_asks_for_full_access_instead_of_opening_settings() {
        assert_eq!(access_action(4), AccessAction::RequestPrompt);
        assert!(!access_granted(4));
    }

    #[test]
    fn a_successful_prompt_can_fetch_before_status_catches_up() {
        assert!(can_fetch_events(2, true));
        assert!(!can_fetch_events(2, false));
        assert!(can_fetch_events(3, false));
    }

    #[test]
    fn undetermined_asks_for_access() {
        assert_eq!(access_action(0), AccessAction::RequestPrompt);
    }

    #[test]
    fn denied_and_restricted_open_system_settings() {
        assert_eq!(access_action(1), AccessAction::OpenSettings);
        assert_eq!(access_action(2), AccessAction::OpenSettings);
        assert!(!access_granted(2));
    }

    #[test]
    fn privacy_urls_cover_ventura_and_legacy_settings() {
        assert!(CALENDAR_PRIVACY_URLS
            .iter()
            .any(|url| url.contains("PrivacySecurity")));
        assert!(CALENDAR_PRIVACY_URLS
            .iter()
            .any(|url| url.contains("preference.security")));
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[allow(deprecated)]
    fn eventkit_status_values_match_the_access_table() {
        use objc2_event_kit::EKAuthorizationStatus;
        assert_eq!(EKAuthorizationStatus::NotDetermined.0, 0);
        assert_eq!(EKAuthorizationStatus::Restricted.0, 1);
        assert_eq!(EKAuthorizationStatus::Denied.0, 2);
        assert_eq!(EKAuthorizationStatus::FullAccess.0, 3);
        assert_eq!(EKAuthorizationStatus::Authorized.0, 3);
        assert_eq!(EKAuthorizationStatus::WriteOnly.0, 4);
    }
}
