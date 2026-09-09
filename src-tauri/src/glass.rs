//! Native popover material behind the calendar.
//!
//! CSS backdrop-filter only blurs what is already inside the webview, so the
//! card would read as a flat slab without an AppKit view under a transparent
//! WKWebView. `NSVisualEffectView` carries the real material, and it follows
//! the window's light or dark appearance.
//!
//! On macOS 26 the system draws its own menu bar panels with Liquid Glass, so
//! the popovers ask for `NSGlassEffectView` and fall back to
//! `NSVisualEffectView` with the Menu material — what AppKit menus use — on
//! anything older.
//!
//! The effect view fills the popover window.

use objc2::runtime::{AnyClass, AnyObject, Bool};
use objc2::{class, msg_send, sel};
use objc2_foundation::NSRect;
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

use std::sync::atomic::{AtomicBool, Ordering};

const CORNER_RADIUS: f64 = 12.0;

/// Set once the first popover has been dressed, so the pages can tint the
/// material they actually got.
static LIQUID_GLASS: AtomicBool = AtomicBool::new(false);

pub fn is_liquid_glass() -> bool {
    LIQUID_GLASS.load(Ordering::SeqCst)
}

/// A system menu extra dissolves rather than blinking out; this is about the
/// length AppKit takes over it.
pub const FADE: std::time::Duration = std::time::Duration::from_millis(160);

fn window_object(window: &tauri::WebviewWindow) -> Option<&AnyObject> {
    let pointer = window.ns_window().ok()?;
    if pointer.is_null() {
        return None;
    }
    Some(unsafe { &*(pointer as *mut AnyObject) })
}

/// Animates the popover's alpha to zero. The window is still on screen when
/// this returns: the caller hides it once the fade has run.
pub fn fade_out(window: &tauri::WebviewWindow) {
    let Some(ns_window) = window_object(window) else {
        return;
    };
    unsafe {
        let context = class!(NSAnimationContext);
        let _: () = msg_send![context, beginGrouping];
        let current: *mut AnyObject = msg_send![context, currentContext];
        if !current.is_null() {
            let _: () = msg_send![&*current, setDuration: FADE.as_secs_f64()];
        }
        let animator: *mut AnyObject = msg_send![ns_window, animator];
        if !animator.is_null() {
            let _: () = msg_send![&*animator, setAlphaValue: 0.0f64];
        }
        let _: () = msg_send![context, endGrouping];
    }
}

/// Back to full opacity, for the next time the popover opens.
pub fn clear_fade(window: &tauri::WebviewWindow) {
    let Some(ns_window) = window_object(window) else {
        return;
    };
    unsafe {
        let _: () = msg_send![ns_window, setAlphaValue: 1.0f64];
    }
}

/// AppKit's Liquid Glass view, which arrived in macOS 26. Absent before that,
/// so it is looked up by name and the vibrancy view stands in.
fn glass_effect_class() -> Option<&'static AnyClass> {
    AnyClass::get(c"NSGlassEffectView")
}

/// Wraps the window's content in an `NSGlassEffectView`, which is how the
/// system draws its own menu bar panels on macOS 26. The view hosts content
/// rather than sitting behind it: the webview becomes its `contentView`, so
/// the glass reads the content it carries and lenses what is behind the
/// window.
fn wrap_in_liquid_glass(ns_window: &AnyObject, radius: f64) -> bool {
    let Some(class) = glass_effect_class() else {
        return false;
    };
    unsafe {
        let content: *mut AnyObject = msg_send![ns_window, contentView];
        if content.is_null() {
            return false;
        }
        // Hold the content view across the change of parent, or setting the
        // window's new content view drops the last reference to it.
        let previous: *mut AnyObject = msg_send![content, retain];
        let frame: NSRect = msg_send![previous, frame];

        let glass: *mut AnyObject = msg_send![class, alloc];
        let glass: *mut AnyObject = msg_send![glass, initWithFrame: frame];
        if glass.is_null() {
            let _: () = msg_send![previous, release];
            return false;
        }
        let _: () = msg_send![glass, setCornerRadius: radius];
        // Without this the square content shows past the rounded material as
        // a thin rectangle around the popover.
        let _: () = msg_send![glass, setClipsToBounds: Bool::YES];

        let _: () = msg_send![ns_window, setContentView: glass];
        // NSViewWidthSizable | NSViewHeightSizable, so the webview keeps
        // filling the glass as the popover resizes to its content.
        let _: () = msg_send![previous, setAutoresizingMask: 18usize];
        let _: () = msg_send![glass, setContentView: previous];
        round_corners(&*previous, radius);
        let _: () = msg_send![previous, release];
        // The shadow was traced around the square frame this replaced.
        let _: () = msg_send![ns_window, invalidateShadow];
        true
    }
}
/// Must run on the main thread. Setup already does.
pub fn apply_calendar_glass(window: &tauri::WebviewWindow) {
    let Ok(pointer) = window.ns_window() else {
        return;
    };
    if pointer.is_null() {
        return;
    }
    let ns_window = unsafe { &*(pointer as *mut AnyObject) };
    clear_window(ns_window);

    if wrap_in_liquid_glass(ns_window, CORNER_RADIUS) {
        // Glass carries its own shading, so the pages drop their scrim. They
        // ask for the material on load rather than being told, which would
        // race the page.
        LIQUID_GLASS.store(true, Ordering::SeqCst);
        return;
    }

    let _ = apply_vibrancy(
        window,
        NSVisualEffectMaterial::Menu,
        Some(NSVisualEffectState::Active),
        Some(CORNER_RADIUS),
    );
}

/// Light, dark, or follow the system. The webview's `color-scheme` is not
/// enough: WKWebView and the glass view both read the window appearance.
pub fn apply_appearance(window: &tauri::WebviewWindow, theme: &str) {
    let Ok(pointer) = window.ns_window() else {
        return;
    };
    if pointer.is_null() {
        return;
    }
    let ns_window = unsafe { &*(pointer as *mut AnyObject) };
    unsafe {
        let appearance = appearance_named(theme);
        let _: () = msg_send![ns_window, setAppearance: appearance];
        let content: *mut AnyObject = msg_send![ns_window, contentView];
        if !content.is_null() {
            let _: () = msg_send![&*content, setAppearance: appearance];
        }
    }
}

fn appearance_named(theme: &str) -> *mut AnyObject {
    let name = match theme {
        "light" => Some(c"NSAppearanceNameAqua"),
        "dark" => Some(c"NSAppearanceNameDarkAqua"),
        _ => None,
    };
    let Some(name) = name else {
        return std::ptr::null_mut();
    };
    unsafe {
        let string: *mut AnyObject = msg_send![class!(NSString), stringWithUTF8String: name.as_ptr()];
        if string.is_null() {
            return std::ptr::null_mut();
        }
        msg_send![class!(NSAppearance), appearanceNamed: string]
    }
}

/// Clips a view and its layer to the popover's corner radius, so the webview
/// cannot paint into the corners the material leaves round.
fn round_corners(view: &AnyObject, radius: f64) {
    unsafe {
        let _: () = msg_send![view, setWantsLayer: Bool::YES];
        let layer: *mut AnyObject = msg_send![view, layer];
        if layer.is_null() {
            return;
        }
        let _: () = msg_send![&*layer, setCornerRadius: radius];
        let _: () = msg_send![&*layer, setMasksToBounds: Bool::YES];
    }
}

fn clear_window(ns_window: &AnyObject) {
    unsafe {
        let clear: *mut AnyObject = msg_send![class!(NSColor), clearColor];
        let _: () = msg_send![ns_window, setOpaque: Bool::NO];
        let _: () = msg_send![ns_window, setBackgroundColor: clear];
        let _: () = msg_send![ns_window, setHasShadow: Bool::YES];

        let content: *mut AnyObject = msg_send![ns_window, contentView];
        if !content.is_null() {
            clear_webview(&*content);
        }
    }
}

fn clear_webview(view: &AnyObject) {
    unsafe {
        let wants: Bool = msg_send![view, respondsToSelector: sel!(setDrawsBackground:)];
        if wants.as_bool() {
            let _: () = msg_send![view, setDrawsBackground: Bool::NO];
        }
        let under: Bool = msg_send![view, respondsToSelector: sel!(setUnderPageBackgroundColor:)];
        if under.as_bool() {
            let clear: *mut AnyObject = msg_send![class!(NSColor), clearColor];
            let _: () = msg_send![view, setUnderPageBackgroundColor: clear];
        }
        let _: () = msg_send![view, setWantsLayer: Bool::YES];
        let layer: *mut AnyObject = msg_send![view, layer];
        if !layer.is_null() {
            let _: () = msg_send![&*layer, setOpaque: Bool::NO];
            let clear: *mut AnyObject = msg_send![class!(NSColor), clearColor];
            let cg: *mut std::ffi::c_void = msg_send![clear, CGColor];
            let _: () = msg_send![&*layer, setBackgroundColor: cg];
        }

        let subviews: *mut AnyObject = msg_send![view, subviews];
        let count: usize = msg_send![subviews, count];
        for index in 0..count {
            let child: *mut AnyObject = msg_send![subviews, objectAtIndex: index];
            if !child.is_null() {
                clear_webview(&*child);
            }
        }
    }
}
