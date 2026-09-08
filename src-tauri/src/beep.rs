const BEEP_VOLUME_CAP: f32 = 0.12;

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct AudioObjectPropertyAddress {
    selector: u32,
    scope: u32,
    element: u32,
}

#[cfg(target_os = "macos")]
#[link(name = "CoreAudio", kind = "framework")]
extern "C" {
    fn AudioObjectGetPropertyData(
        object: u32,
        address: *const AudioObjectPropertyAddress,
        qualifier_size: u32,
        qualifier_data: *const core::ffi::c_void,
        data_size: *mut u32,
        data: *mut core::ffi::c_void,
    ) -> i32;
}

#[cfg(target_os = "macos")]
const K_AUDIO_OBJECT_SYSTEM_OBJECT: u32 = 1;
#[cfg(target_os = "macos")]
const K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE: u32 = u32::from_be_bytes(*b"dOut");
#[cfg(target_os = "macos")]
const K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR: u32 = u32::from_be_bytes(*b"volm");
#[cfg(target_os = "macos")]
const K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT: u32 = u32::from_be_bytes(*b"outp");
#[cfg(target_os = "macos")]
const K_AUDIO_OBJECT_PROPERTY_ELEMENT_MASTER: u32 = 0;

#[cfg(target_os = "macos")]
fn read_volume(device: u32, element: u32) -> Option<f32> {
    let address = AudioObjectPropertyAddress {
        selector: K_AUDIO_DEVICE_PROPERTY_VOLUME_SCALAR,
        scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        element,
    };
    let mut volume = 0.0f32;
    let mut size = core::mem::size_of::<f32>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            device,
            &address,
            0,
            core::ptr::null(),
            &mut size,
            (&mut volume as *mut f32).cast(),
        )
    };
    (status == 0 && size >= 4).then(|| volume.clamp(0.0, 1.0))
}

/// Reads default output volume, preferring master then output channels.
#[cfg(target_os = "macos")]
pub fn system_output_volume() -> Option<f32> {
    let address = AudioObjectPropertyAddress {
        selector: K_AUDIO_HARDWARE_PROPERTY_DEFAULT_OUTPUT_DEVICE,
        scope: K_AUDIO_OBJECT_PROPERTY_SCOPE_OUTPUT,
        element: K_AUDIO_OBJECT_PROPERTY_ELEMENT_MASTER,
    };
    let mut device = 0u32;
    let mut size = core::mem::size_of::<u32>() as u32;
    let status = unsafe {
        AudioObjectGetPropertyData(
            K_AUDIO_OBJECT_SYSTEM_OBJECT,
            &address,
            0,
            core::ptr::null(),
            &mut size,
            (&mut device as *mut u32).cast(),
        )
    };
    if status != 0 || device == 0 {
        return None;
    }
    read_volume(device, K_AUDIO_OBJECT_PROPERTY_ELEMENT_MASTER)
        .or_else(|| read_volume(device, 1).zip(read_volume(device, 2)).map(|(a, b)| (a + b) / 2.0))
        .or_else(|| read_volume(device, 1))
}

#[cfg(not(target_os = "macos"))]
pub fn system_output_volume() -> Option<f32> { None }

pub fn beep_playback_volume() -> f32 {
    match system_output_volume() {
        Some(system_volume) if system_volume > 0.0 => (BEEP_VOLUME_CAP / system_volume).min(1.0),
        Some(_) => 1.0,
        None => BEEP_VOLUME_CAP,
    }
    .clamp(0.0, 1.0)
}

#[cfg(target_os = "macos")]
pub fn play_native(path: &std::path::Path, volume: f32) -> Result<(), String> {
    use objc2::runtime::{AnyObject, Bool};
    use objc2::{class, msg_send};
    use std::ffi::CString;
    let encoded = CString::new(path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
    unsafe {
        let string: *mut AnyObject = msg_send![class!(NSString), stringWithUTF8String: encoded.as_ptr()];
        if string.is_null() { return Err("Could not create beep path".into()); }
        let allocated: *mut AnyObject = msg_send![class!(NSSound), alloc];
        let sound: *mut AnyObject = msg_send![allocated, initWithContentsOfFile: string, byReference: Bool::YES];
        if sound.is_null() { return Err("Could not load beep sound".into()); }
        let _: () = msg_send![sound, setVolume: volume.clamp(0.0, 1.0)];
        let played: Bool = msg_send![sound, play];
        if played.as_bool() { Ok(()) } else { Err("Could not play beep sound".into()) }
    }
}

#[cfg(test)]
mod tests {
    use super::BEEP_VOLUME_CAP;

    fn playback(system: f32) -> f32 {
        if system > 0.0 { (BEEP_VOLUME_CAP / system).min(1.0) } else { 1.0 }
    }

    #[test]
    fn caps_effective_volume() {
        for (system, expected) in [(1.0, 0.12), (0.5, 0.24), (0.25, 0.48), (0.12, 1.0), (0.1, 1.0), (0.0, 1.0)] {
            assert!((playback(system) - expected).abs() < f32::EPSILON);
        }
    }
}
