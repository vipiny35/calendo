//! Native popover material behind the calendar.
//!
//! CSS backdrop-filter only blurs what is already inside the webview, so the
//! card would read as a flat slab without an AppKit view under a transparent
//! WKWebView. `NSVisualEffectView` with the Popover material is what a real
//! menu-bar extra uses, and it follows the window's light or dark appearance.
//!
//! The effect view is inset by `CARET_HEIGHT` so the triangle that points at
//! the menu bar icon sits on clear pixels, not a rectangular slab of glass.

use objc2::encode::{Encode, Encoding};
use objc2::runtime::{AnyObject, Bool};
use objc2::{class, msg_send, sel};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

pub const CARET_HEIGHT: f64 = 11.0;
const CORNER_RADIUS: f64 = 12.0;
const NS_VIEW_WIDTH_SIZABLE: usize = 2;
const NS_VIEW_HEIGHT_SIZABLE: usize = 16;

#[repr(C)]
#[derive(Clone, Copy)]
struct NSPoint {
    x: f64,
    y: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct NSSize {
    width: f64,
    height: f64,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct NSRect {
    origin: NSPoint,
    size: NSSize,
}

unsafe impl Encode for NSPoint {
    const ENCODING: Encoding = Encoding::Struct("CGPoint", &[f64::ENCODING, f64::ENCODING]);
}

unsafe impl Encode for NSSize {
    const ENCODING: Encoding = Encoding::Struct("CGSize", &[f64::ENCODING, f64::ENCODING]);
}

unsafe impl Encode for NSRect {
    const ENCODING: Encoding = Encoding::Struct("CGRect", &[NSPoint::ENCODING, NSSize::ENCODING]);
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

    let _ = apply_vibrancy(
        window,
        NSVisualEffectMaterial::Popover,
        Some(NSVisualEffectState::Active),
        Some(CORNER_RADIUS),
    );
    inset_existing_effect(ns_window);
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

fn caret_frame(content: &AnyObject, bounds: NSRect) -> NSRect {
    let flipped: Bool = unsafe { msg_send![content, isFlipped] };
    let height = (bounds.size.height - CARET_HEIGHT).max(0.0);
    let origin_y = if flipped.as_bool() {
        bounds.origin.y + CARET_HEIGHT
    } else {
        bounds.origin.y
    };
    NSRect {
        origin: NSPoint {
            x: bounds.origin.x,
            y: origin_y,
        },
        size: NSSize {
            width: bounds.size.width,
            height,
        },
    }
}

fn inset_existing_effect(ns_window: &AnyObject) {
    unsafe {
        let content: *mut AnyObject = msg_send![ns_window, contentView];
        if content.is_null() {
            return;
        }
        let bounds: NSRect = msg_send![&*content, bounds];
        let frame = caret_frame(&*content, bounds);
        let subviews: *mut AnyObject = msg_send![&*content, subviews];
        let count: usize = msg_send![subviews, count];
        for index in 0..count {
            let child: *mut AnyObject = msg_send![subviews, objectAtIndex: index];
            if child.is_null() {
                continue;
            }
            let class: *mut AnyObject = msg_send![&*child, class];
            let name: *mut AnyObject = msg_send![class, className];
            if name.is_null() {
                continue;
            }
            let utf8: *const i8 = msg_send![&*name, UTF8String];
            if utf8.is_null() {
                continue;
            }
            let label = std::ffi::CStr::from_ptr(utf8).to_string_lossy();
            if label.contains("VisualEffect") || label.contains("GlassEffect") {
                let _: () = msg_send![&*child, setFrame: frame];
                let _: () = msg_send![
                    &*child,
                    setAutoresizingMask: NS_VIEW_WIDTH_SIZABLE | NS_VIEW_HEIGHT_SIZABLE
                ];
            }
        }
    }
}
