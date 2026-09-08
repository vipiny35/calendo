//! Native glass behind the calendar popover.
//!
//! CSS backdrop-filter only blurs what is already inside the webview, which is
//! why the first popover read as a flat charcoal card. The material has to be
//! an AppKit view under a transparent WKWebView.
//!
//! On macOS 26, `NSGlassEffectView` is the Liquid Glass container. Older
//! systems get `NSVisualEffectView` with the Menu material, the same thing a
//! real menu extra uses.

use objc2::encode::{Encode, Encoding};
use objc2::runtime::{AnyObject, Bool};
use objc2::{class, msg_send, sel};
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

const CORNER_RADIUS: f64 = 16.0;
const NS_VIEW_WIDTH_SIZABLE: usize = 2;
const NS_VIEW_HEIGHT_SIZABLE: usize = 16;
const NS_WINDOW_BELOW: isize = -1;

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

    if apply_liquid_glass(ns_window).is_ok() {
        return;
    }

    let _ = apply_vibrancy(
        window,
        NSVisualEffectMaterial::Menu,
        Some(NSVisualEffectState::Active),
        Some(CORNER_RADIUS),
    );
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

fn apply_liquid_glass(ns_window: &AnyObject) -> Result<(), ()> {
    let Some(glass_class) = objc2::runtime::AnyClass::get(c"NSGlassEffectView") else {
        return Err(());
    };

    unsafe {
        let content: *mut AnyObject = msg_send![ns_window, contentView];
        if content.is_null() {
            return Err(());
        }
        let bounds: NSRect = msg_send![&*content, bounds];
        let alloc: *mut AnyObject = msg_send![glass_class, alloc];
        let glass: *mut AnyObject = msg_send![alloc, initWithFrame: bounds];
        if glass.is_null() {
            return Err(());
        }
        let _: () = msg_send![&*glass, setCornerRadius: CORNER_RADIUS];
        let _: () = msg_send![
            &*glass,
            setAutoresizingMask: NS_VIEW_WIDTH_SIZABLE | NS_VIEW_HEIGHT_SIZABLE
        ];

        let subviews: *mut AnyObject = msg_send![&*content, subviews];
        let count: usize = msg_send![subviews, count];
        let relative: *mut AnyObject = if count > 0 {
            msg_send![subviews, objectAtIndex: 0usize]
        } else {
            std::ptr::null_mut()
        };
        let _: () = msg_send![
            &*content,
            addSubview: glass,
            positioned: NS_WINDOW_BELOW,
            relativeTo: relative
        ];
    }
    Ok(())
}
