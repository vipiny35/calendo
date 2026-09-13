//! Read-only integration with the user's macOS calendars.

use serde::Serialize;

/// How the user answered the invitation. Events with no attendees — a plain
/// entry the user owns — report `Confirmed`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Response {
    Confirmed,
    Accepted,
    Tentative,
    Declined,
    Pending,
}

/// EKParticipantStatus values: Unknown=0, Pending=1, Accepted=2, Declined=3,
/// Tentative=4, Delegated=5, Completed=6, InProcess=7.
pub(crate) fn response_for(status: isize, is_attendee: bool) -> Response {
    if !is_attendee {
        return Response::Confirmed;
    }
    match status {
        2 | 6 | 7 => Response::Accepted,
        3 => Response::Declined,
        4 => Response::Tentative,
        5 => Response::Pending,
        _ => Response::Pending,
    }
}

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
    pub response: Response,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarInfo {
    pub id: String,
    pub title: String,
    pub source: Option<String>,
    pub color: Option<String>,
}

/// Missing identifiers stay visible so a calendar EventKit cannot name is not dropped.
pub(crate) fn calendar_is_visible(calendar_id: Option<&str>, hidden: &[String]) -> bool {
    match calendar_id {
        None => true,
        Some(id) => !hidden.iter().any(|item| item == id),
    }
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

/// Calendar apps claim `ical://ekevent`, so this reaches whichever one the
/// user has set as default. Identifiers carry colons, which have to be
/// escaped to stay inside one path segment.
pub(crate) fn event_show_url(id: &str) -> String {
    let mut escaped = String::with_capacity(id.len());
    for byte in id.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                escaped.push(byte as char)
            }
            _ => escaped.push_str(&format!("%{byte:02X}")),
        }
    }
    format!("ical://ekevent/{escaped}?method=show&options=more")
}

pub(crate) const CALENDAR_PRIVACY_URLS: &[&str] = &[
    "x-apple.systempreferences:com.apple.Settings.PrivacySecurity.extension?Privacy_Calendars",
    "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Calendars",
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Calendars",
];

/// Hosts recognised as a joinable meeting. Keep in step with `meetings.ts`.
const MEETING_HOSTS: &[&str] = &[
    "meet.google.com",
    "zoom.us",
    "zoom.com",
    "facetime.apple.com",
    "teams.microsoft.com",
    "teams.live.com",
    "webex.com",
    "jit.si",
    "jitsi.org",
    "gotomeeting.com",
    "goto.com",
];

fn host_of(url: &str) -> Option<String> {
    let rest = url.split_once("://")?.1;
    let host = rest.split(['/', '?', '#']).next()?.trim();
    let host = host.split('@').next_back()?.trim();
    if host.is_empty() {
        return None;
    }
    Some(host.trim_end_matches('.').to_ascii_lowercase())
}

fn serves_host(host: &str, domain: &str) -> bool {
    host == domain || host.ends_with(&format!(".{domain}"))
}

fn is_meeting_url(url: &str) -> bool {
    host_of(url).is_some_and(|host| {
        MEETING_HOSTS
            .iter()
            .any(|domain| serves_host(&host, domain))
    })
}

fn from_hex(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (from_hex(bytes[index + 1]), from_hex(bytes[index + 2]))
            {
                out.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn query_param(url: &str, name: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=')?;
        if key == name {
            return Some(percent_decode(value));
        }
    }
    None
}

/// Google Calendar wraps the real join link in a redirect.
fn unwrap_redirect(url: &str) -> String {
    let host = host_of(url).unwrap_or_default();
    if (serves_host(&host, "google.com") || serves_host(&host, "googleusercontent.com"))
        && url.contains("/url?")
    {
        if let Some(target) = query_param(url, "q") {
            if target.starts_with("http://") || target.starts_with("https://") {
                return target;
            }
        }
    }
    url.to_string()
}

fn decode_entities(url: &str) -> String {
    url.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
}

fn url_end(slice: &str) -> usize {
    let mut end = 0;
    for (index, character) in slice.char_indices() {
        if character.is_whitespace()
            || matches!(
                character,
                '"' | '\'' | '<' | '>' | ')' | ']' | '`' | '{' | '}'
            )
        {
            break;
        }
        end = index + character.len_utf8();
    }
    end
}

fn take_http_url(input: &str, start: usize) -> String {
    let mut url = decode_entities(&input[start..start + url_end(&input[start..])]);
    while url.ends_with(['.', ',', ';', ':', '!', '?']) {
        url.pop();
    }
    unwrap_redirect(&url)
}

/// http(s) URLs anywhere in the text, not only as whitespace-delimited tokens.
/// Zoom invites from Google Calendar and Outlook put the join link in an href.
fn urls_in(value: &str) -> Vec<String> {
    let mut urls = Vec::new();
    let lower = value.to_ascii_lowercase();
    let mut cursor = 0;
    while cursor < value.len() {
        let rest = &lower[cursor..];
        let https = rest.find("https://");
        let http = rest.find("http://");
        let relative = match (https, http) {
            (Some(https), Some(http)) => https.min(http),
            (Some(https), None) => https,
            (None, Some(http)) => http,
            (None, None) => break,
        };
        let start = cursor + relative;
        let raw_end = url_end(&value[start..]).max(1);
        let url = take_http_url(value, start);
        cursor = start + raw_end;
        if url.starts_with("http://") || url.starts_with("https://") {
            urls.push(url);
        }
    }
    urls
}

fn zoommtg_to_https(value: &str) -> Option<String> {
    let lower = value.to_ascii_lowercase();
    let start = lower.find("zoommtg://")?;
    let rest = &value[start + "zoommtg://".len()..];
    let url = take_http_url(&format!("https://{rest}"), 0);
    let host = host_of(&url)?;
    if !serves_host(&host, "zoom.us") && !serves_host(&host, "zoom.com") {
        return None;
    }
    let confno = query_param(&url, "confno")?;
    if confno.is_empty() {
        return None;
    }
    let mut join = format!("https://{host}/j/{confno}");
    if let Some(pwd) = query_param(&url, "pwd") {
        if !pwd.is_empty() {
            join.push_str(&format!("?pwd={pwd}"));
        }
    }
    Some(join)
}

/// Pull a joinable http(s) URL out of an event's URL, location, and notes.
/// Meeting hosts win when several URLs are present, so a Google Calendar
/// wrapper or a company website in `URL` does not hide a Zoom link in notes.
pub(crate) fn extract_join_url(
    event_url: Option<&str>,
    location: Option<&str>,
    notes: Option<&str>,
) -> Option<String> {
    let mut first_any = None;
    let mut first_meeting = None;
    for blob in [event_url, location, notes].into_iter().flatten() {
        if first_meeting.is_none() {
            if let Some(zoom) = zoommtg_to_https(blob) {
                first_meeting = Some(zoom);
            }
        }
        for url in urls_in(blob) {
            if first_any.is_none() {
                first_any = Some(url.clone());
            }
            if first_meeting.is_none() && is_meeting_url(&url) {
                first_meeting = Some(url);
            }
        }
    }
    first_meeting.or(first_any)
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{
        access_action, access_granted, can_fetch_events, event_show_url, response_for,
        AccessAction, Response, UpcomingEvent, CALENDAR_PRIVACY_URLS,
    };
    use block2::RcBlock;
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::runtime::Bool;
    use objc2::{available, AnyThread};
    use objc2_app_kit::{NSApplication, NSColorSpace, NSWorkspace};
    use objc2_event_kit::{EKCalendar, EKEntityType, EKEventStore, EKSource};
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
        let completion = RcBlock::new(
            move |granted: Bool, error: *mut objc2_foundation::NSError| {
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
            },
        );
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

    /// The user's own answer to the invitation, read from the attendee list.
    fn own_response(event: &objc2_event_kit::EKEvent) -> Response {
        let Some(attendees) = (unsafe { event.attendees() }) else {
            return Response::Confirmed;
        };
        for index in 0..attendees.count() {
            let attendee = attendees.objectAtIndex(index);
            if unsafe { attendee.isCurrentUser() } {
                return response_for(unsafe { attendee.participantStatus() }.0, true);
            }
        }
        // An invitation whose attendee list does not name us still counts as
        // one: fall back to the organizer's view of the event.
        Response::Confirmed
    }

    fn calendar_hex(calendar: &EKCalendar) -> Option<String> {
        let color = unsafe { calendar.color() };
        let srgb = color.colorUsingColorSpace(&NSColorSpace::sRGBColorSpace())?;
        let mut red = 0.0;
        let mut green = 0.0;
        let mut blue = 0.0;
        let mut alpha = 0.0;
        unsafe {
            srgb.getRed_green_blue_alpha(&mut red, &mut green, &mut blue, &mut alpha);
        }
        let byte = |value: f64| (value * 255.0).round().clamp(0.0, 255.0) as u8;
        Some(format!(
            "#{:02X}{:02X}{:02X}",
            byte(red),
            byte(green),
            byte(blue)
        ))
    }

    fn calendar_source_title(source: Option<Retained<EKSource>>) -> Option<String> {
        source.map(|value| {
            let title = unsafe { value.title() };
            ns_string(&title)
        })
    }

    pub fn list_macos() -> Result<Vec<super::CalendarInfo>, String> {
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
                return Ok(Vec::new());
            }
            let calendars = unsafe { store.calendarsForEntityType(EKEntityType::Event) };
            let mut found = Vec::new();
            for index in 0..calendars.count() {
                let calendar = calendars.objectAtIndex(index);
                let id_obj = unsafe { calendar.calendarIdentifier() };
                let id = ns_string(&id_obj);
                if id.is_empty() {
                    continue;
                }
                let title_obj = unsafe { calendar.title() };
                let title = ns_string(&title_obj);
                found.push(super::CalendarInfo {
                    id,
                    title: if title.is_empty() {
                        "Untitled calendar".into()
                    } else {
                        title
                    },
                    source: calendar_source_title(unsafe { calendar.source() }),
                    color: calendar_hex(&calendar),
                });
            }
            found.sort_by(|left, right| {
                left.source
                    .cmp(&right.source)
                    .then_with(|| left.title.cmp(&right.title))
            });
            Ok(found)
        })
    }

    pub fn fetch_macos_range(
        start_ms: i64,
        end_ms: i64,
        hidden: &[String],
    ) -> Result<Vec<UpcomingEvent>, String> {
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
                let join_url = super::extract_join_url(
                    event_url.as_deref(),
                    location.as_deref(),
                    notes.as_deref(),
                );
                let raw_calendar: Option<Retained<EKCalendar>> = unsafe { event.calendar() };
                let calendar_id = raw_calendar.as_ref().map(|value| {
                    let id_obj = unsafe { value.calendarIdentifier() };
                    ns_string(&id_obj)
                });
                if !super::calendar_is_visible(calendar_id.as_deref(), hidden) {
                    continue;
                }
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
                    response: own_response(&event),
                });
            }
            found.sort_by_key(|event| event.start_at);
            Ok(found)
        })
    }

    pub fn fetch_macos(hidden: &[String]) -> Result<Option<UpcomingEvent>, String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|error| error.to_string())?;
        let start_ms = now.as_millis() as i64;
        let end_ms = start_ms.saturating_add(7 * 24 * 60 * 60 * 1000);
        Ok(fetch_macos_range(start_ms, end_ms, hidden)?
            .into_iter()
            .next())
    }

    pub fn open_event(id: &str) -> Result<(), String> {
        let string = NSString::from_str(&event_show_url(id));
        let Some(url) = NSURL::URLWithString(&string) else {
            return Err("Invalid event link".into());
        };
        if NSWorkspace::sharedWorkspace().openURL(&url) {
            Ok(())
        } else {
            Err("Could not open the event in your calendar".into())
        }
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

pub fn list_calendars() -> Result<Vec<CalendarInfo>, String> {
    #[cfg(target_os = "macos")]
    {
        macos::list_macos()
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(Vec::new())
    }
}

pub fn fetch_upcoming(hidden: &[String]) -> Result<Option<UpcomingEvent>, String> {
    #[cfg(target_os = "macos")]
    {
        macos::fetch_macos(hidden)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = hidden;
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

pub fn fetch_range(
    start_ms: i64,
    end_ms: i64,
    hidden: &[String],
) -> Result<Vec<UpcomingEvent>, String> {
    #[cfg(target_os = "macos")]
    {
        if end_ms <= start_ms {
            return Ok(Vec::new());
        }
        macos::fetch_macos_range(start_ms, end_ms, hidden)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (start_ms, end_ms, hidden);
        Ok(Vec::new())
    }
}

pub fn open_event(id: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err("This event has no identifier to open".into());
    }
    #[cfg(target_os = "macos")]
    {
        macos::open_event(id)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Err("Opening events is only supported on macOS".into())
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
    use super::{
        access_action, access_granted, calendar_is_visible, can_fetch_events, event_show_url,
        extract_join_url, response_for, AccessAction, Response, CALENDAR_PRIVACY_URLS,
    };

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

    #[test]
    fn event_links_escape_the_identifier() {
        assert_eq!(
            event_show_url("ABC-123"),
            "ical://ekevent/ABC-123?method=show&options=more"
        );
        assert!(event_show_url("A1B2:C3D4").starts_with("ical://ekevent/A1B2%3AC3D4?"));
        assert!(event_show_url("with space/slash").contains("with%20space%2Fslash"));
    }

    #[test]
    fn hidden_calendars_are_skipped_and_unnamed_ones_stay() {
        assert!(calendar_is_visible(Some("home"), &[]));
        assert!(!calendar_is_visible(
            Some("work"),
            &["work".into(), "birthdays".into()]
        ));
        assert!(calendar_is_visible(None, &["work".into()]));
    }

    #[test]
    fn invitation_answers_map_to_marker_styles() {
        assert_eq!(response_for(0, false), Response::Confirmed);
        assert_eq!(response_for(2, true), Response::Accepted);
        assert_eq!(response_for(3, true), Response::Declined);
        assert_eq!(response_for(4, true), Response::Tentative);
        assert_eq!(response_for(1, true), Response::Pending);
        assert_eq!(response_for(0, true), Response::Pending);
    }

    #[test]
    fn a_bare_zoom_url_in_notes_is_enough() {
        assert_eq!(
            extract_join_url(
                None,
                None,
                Some("Join Zoom Meeting\nhttps://acme.zoom.us/j/123")
            ),
            Some("https://acme.zoom.us/j/123".into())
        );
    }

    #[test]
    fn html_notes_still_yield_a_zoom_join_link() {
        let notes = concat!(
            "<html><body>Join Zoom Meeting<br>",
            "<a href=\"https://us02web.zoom.us/j/8301234567?pwd=AbCd\">",
            "https://us02web.zoom.us/j/8301234567?pwd=AbCd</a>",
            "</body></html>",
        );
        assert_eq!(
            extract_join_url(None, Some("Zoom"), Some(notes)),
            Some("https://us02web.zoom.us/j/8301234567?pwd=AbCd".into())
        );
    }

    #[test]
    fn a_quoted_url_still_counts() {
        assert_eq!(
            extract_join_url(None, None, Some("dial in: \"https://zoom.us/j/99\" thanks")),
            Some("https://zoom.us/j/99".into())
        );
    }

    #[test]
    fn a_meeting_link_wins_over_a_generic_event_url() {
        assert_eq!(
            extract_join_url(
                Some("https://calendar.google.com/calendar/event?eid=abc"),
                None,
                Some("Join: https://meet.google.com/abc-defg-hij"),
            ),
            Some("https://meet.google.com/abc-defg-hij".into())
        );
    }

    #[test]
    fn google_redirects_unwrap_to_the_zoom_link() {
        assert_eq!(
            extract_join_url(
                None,
                None,
                Some("https://www.google.com/url?q=https://zoom.us/j/123%3Fpwd%3Dsecret&sa=D"),
            ),
            Some("https://zoom.us/j/123?pwd=secret".into())
        );
    }

    #[test]
    fn zoommtg_links_become_https_join_urls() {
        assert_eq!(
            extract_join_url(
                Some("zoommtg://zoom.us/join?confno=123456789&pwd=abc"),
                None,
                None,
            ),
            Some("https://zoom.us/j/123456789?pwd=abc".into())
        );
    }

    #[test]
    fn zoom_com_hosts_count_as_zoom() {
        assert_eq!(
            extract_join_url(None, Some("https://company.zoom.com/j/55"), None),
            Some("https://company.zoom.com/j/55".into())
        );
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
