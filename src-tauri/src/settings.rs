//! Persisted preferences for the menu bar calendar.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const MENU_BAR_ICONS: [&str; 4] = ["filled", "framed", "calendar", "none"];

/// Styles that no longer exist, mapped to the nearest one that does.
const RETIRED_ICONS: [(&str, &str); 1] = [("outline", "framed")];

/// Formats written before icon style and weekday/month toggles.
const LEGACY_FORMATS: [(&str, &str, bool, bool); 11] = [
    ("iconOnly", "filled", false, false),
    ("iconDay", "filled", false, false),
    ("iconWeekdayDay", "filled", true, false),
    ("iconWeekdayDayMonth", "filled", true, true),
    ("dateOnly", "none", true, false),
    ("weekdayDay", "filled", true, false),
    ("monthDay", "filled", false, true),
    ("weekdayMonthDay", "filled", true, true),
    ("day", "filled", false, false),
    ("weekday", "filled", true, false),
    ("full", "filled", true, true),
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub menu_bar_icon: String,
    pub show_weekday: bool,
    pub show_month: bool,
    pub week_starts_on: u8,
    pub show_week_numbers: bool,
    pub highlight_weekdays: Vec<u8>,
    /// Read only so files from before column highlighting can be migrated.
    #[allow(dead_code)]
    #[serde(default, skip_serializing)]
    pub dim_weekends: bool,
    /// Read only so files from before icon styles can be migrated.
    #[allow(dead_code)]
    #[serde(default, skip_serializing)]
    pub menu_bar_format: String,
    pub launch_at_login: bool,
    pub beep_on_the_hour: bool,
    pub auto_update: bool,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            menu_bar_icon: "filled".into(),
            show_weekday: true,
            show_month: false,
            week_starts_on: 0,
            show_week_numbers: false,
            highlight_weekdays: vec![0, 6],
            dim_weekends: true,
            menu_bar_format: String::new(),
            launch_at_login: false,
            beep_on_the_hour: false,
            auto_update: true,
            theme: "system".into(),
        }
    }
}

impl AppSettings {
    fn migrate_legacy_format(&mut self) {
        if let Some((_, icon, weekday, month)) = LEGACY_FORMATS
            .iter()
            .find(|(legacy, _, _, _)| *legacy == self.menu_bar_format)
        {
            self.menu_bar_icon = (*icon).into();
            self.show_weekday = *weekday;
            self.show_month = *month;
        }
    }

    pub fn normalize(mut self, base: &AppSettings) -> Self {
        if let Some((_, replacement)) = RETIRED_ICONS
            .iter()
            .find(|(retired, _)| *retired == self.menu_bar_icon)
        {
            self.menu_bar_icon = (*replacement).into();
        }
        if !MENU_BAR_ICONS.contains(&self.menu_bar_icon.as_str()) {
            self.menu_bar_icon = base.menu_bar_icon.clone();
        }
        if self.week_starts_on > 6 {
            self.week_starts_on = base.week_starts_on;
        }
        if !matches!(self.theme.as_str(), "system" | "light" | "dark") {
            self.theme = base.theme.clone();
        }
        let mut days: Vec<u8> = self
            .highlight_weekdays
            .iter()
            .copied()
            .filter(|day| *day <= 6)
            .collect();
        days.sort_unstable();
        days.dedup();
        self.highlight_weekdays = days;
        self
    }
}

pub struct SettingsStore {
    path: PathBuf,
    current: AppSettings,
}

impl SettingsStore {
    pub fn load(dir: PathBuf) -> Self {
        let path = dir.join("settings.json");
        let current = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| {
                let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
                let mut parsed: AppSettings = serde_json::from_value(value.clone()).ok()?;
                if value.get("highlightWeekdays").is_none() {
                    let dim = value
                        .get("dimWeekends")
                        .and_then(|item| item.as_bool())
                        .unwrap_or(true);
                    parsed.highlight_weekdays = if dim { vec![0, 6] } else { vec![] };
                }
                if value.get("menuBarIcon").is_none() {
                    parsed.migrate_legacy_format();
                }
                Some(parsed.normalize(&AppSettings::default()))
            })
            .unwrap_or_default();
        Self { path, current }
    }

    pub fn value(&self) -> AppSettings {
        self.current.clone()
    }

    pub fn update(&mut self, patch: AppSettings) -> AppSettings {
        self.current = patch.normalize(&self.current);
        self.write();
        self.current.clone()
    }

    fn write(&self) {
        if let Some(parent) = self.path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if let Ok(body) = serde_json::to_string_pretty(&self.current) {
            let _ = fs::write(&self.path, format!("{body}\n"));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_week_starts_on_sunday() {
        assert_eq!(AppSettings::default().week_starts_on, 0);
    }

    #[test]
    fn accepts_every_week_start_and_rejects_out_of_range() {
        let base = AppSettings::default();
        for day in 0..=6 {
            let mut input = base.clone();
            input.week_starts_on = day;
            assert_eq!(input.normalize(&base).week_starts_on, day);
        }
        let mut input = base.clone();
        input.week_starts_on = 7;
        assert_eq!(input.normalize(&base).week_starts_on, base.week_starts_on);
    }

    #[test]
    fn rejects_an_unknown_icon() {
        let base = AppSettings::default();
        let mut input = base.clone();
        input.menu_bar_icon = "rainbow".into();
        assert_eq!(input.normalize(&base).menu_bar_icon, base.menu_bar_icon);
    }

    #[test]
    fn migrates_a_format_from_before_icon_styles() {
        let dir = std::env::temp_dir().join(format!(
            "calendo-settings-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        fs::write(
            dir.join("settings.json"),
            r#"{"menuBarFormat": "dateOnly", "theme": "dark"}
"#,
        )
        .expect("writes");
        let store = SettingsStore::load(dir.clone());
        assert_eq!(store.value().menu_bar_icon, "none");
        assert!(store.value().show_weekday);
        assert!(!store.value().show_month);
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn migrates_the_retired_outline_glyph_to_the_framed_date() {
        let base = AppSettings::default();
        let mut input = base.clone();
        input.menu_bar_icon = "outline".into();
        assert_eq!(input.normalize(&base).menu_bar_icon, "framed");
    }

    #[test]
    fn keeps_the_undated_calendar_glyph() {
        let base = AppSettings::default();
        let mut input = base.clone();
        input.menu_bar_icon = "calendar".into();
        assert_eq!(input.normalize(&base).menu_bar_icon, "calendar");
    }

    #[test]
    fn keeps_the_framed_date_and_the_hour_chime() {
        let base = AppSettings::default();
        let mut input = base.clone();
        input.menu_bar_icon = "framed".into();
        input.beep_on_the_hour = true;
        let settings = input.normalize(&base);
        assert_eq!(settings.menu_bar_icon, "framed");
        assert!(settings.beep_on_the_hour);
    }

    #[test]
    fn keeps_monday_as_a_week_start() {
        let base = AppSettings::default();
        let mut input = base.clone();
        input.week_starts_on = 1;
        assert_eq!(input.normalize(&base).week_starts_on, 1);
    }

    #[test]
    fn keeps_a_midweek_start() {
        let base = AppSettings::default();
        let mut input = base.clone();
        input.week_starts_on = 3;
        assert_eq!(input.normalize(&base).week_starts_on, 3);
    }

    #[test]
    fn writes_camel_case_keys() {
        let body = serde_json::to_string(&AppSettings::default()).expect("serializes");
        assert!(body.contains("\"menuBarIcon\""));
        assert!(body.contains("\"showWeekday\""));
        assert!(body.contains("\"beepOnTheHour\""));
        assert!(body.contains("\"weekStartsOn\""));
        assert!(body.contains("\"highlightWeekdays\""));
        assert!(body.contains("\"launchAtLogin\""));
        assert!(!body.contains("menu_bar_icon"));
        assert!(!body.contains("menuBarFormat"));
        assert!(!body.contains("dimWeekends"));
    }

    #[test]
    fn reads_a_camel_case_settings_file() {
        let raw = r#"{
            "menuBarIcon": "framed",
            "showWeekday": false,
            "showMonth": true,
            "weekStartsOn": 1,
            "showWeekNumbers": true,
            "highlightWeekdays": [1, 5],
            "launchAtLogin": true,
            "beepOnTheHour": true,
            "theme": "dark"
        }"#;
        let parsed: AppSettings = serde_json::from_str(raw).expect("parses");
        let settings = parsed.normalize(&AppSettings::default());
        assert_eq!(settings.menu_bar_icon, "framed");
        assert!(!settings.show_weekday);
        assert!(settings.show_month);
        assert_eq!(settings.week_starts_on, 1);
        assert!(settings.show_week_numbers);
        assert_eq!(settings.highlight_weekdays, vec![1, 5]);
        assert!(settings.launch_at_login);
        assert!(settings.beep_on_the_hour);
        assert_eq!(settings.theme, "dark");
    }

    #[test]
    fn migrates_dim_weekends_off_to_no_highlights() {
        let dir = std::env::temp_dir().join(format!(
            "calendo-settings-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("temp dir");
        fs::write(
            dir.join("settings.json"),
            r#"{"dimWeekends": false, "theme": "dark"}
"#,
        )
        .expect("writes");
        let store = SettingsStore::load(dir.clone());
        assert!(store.value().highlight_weekdays.is_empty());
        let _ = fs::remove_dir_all(dir);
    }
}
