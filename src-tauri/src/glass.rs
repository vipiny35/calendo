//! Native popover material behind the calendar.
//!
//! CSS backdrop-filter only blurs what is already inside the webview, so the
//! card would read as a flat slab without an AppKit view under a transparent
//! WKWebView. `NSVisualEffectView` carries the real material, and it follows
//! the window's light or dark appearance.
//!
//! The material is Menu (NSVisualEffectMaterialMenu), which is what AppKit
//! menus and the system's own menu bar panels — Wi-Fi, Sound, Control Centre —
//! are drawn with. Popover is the material of a view-anchored popover and
//! reads noticeably lighter and thinner beside them.
//!
//! The effect view fills the popover window.

use objc2::runtime::{AnyObject, Bool};
use objc2::{class, msg_send, sel};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

const CORNER_RADIUS: f64 = 12.0;
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
