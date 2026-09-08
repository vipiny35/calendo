//! Persisted preferences for the menu bar calendar.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

const MENU_BAR_FORMATS: [&str; 6] = [
    "weekdayDay",
    "monthDay",
    "weekdayMonthDay",
    "day",
    "weekday",
    "full",
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub menu_bar_format: String,
    pub week_starts_on: u8,
    pub show_week_numbers: bool,
    pub dim_weekends: bool,
    pub launch_at_login: bool,
    pub theme: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            menu_bar_format: "weekdayDay".into(),
            week_starts_on: 0,
            show_week_numbers: false,
            dim_weekends: true,
            launch_at_login: false,
            theme: "system".into(),
        }
    }
}

impl AppSettings {
    pub fn normalize(mut self, base: &AppSettings) -> Self {
        if !MENU_BAR_FORMATS.contains(&self.menu_bar_format.as_str()) {
            self.menu_bar_format = base.menu_bar_format.clone();
        }
        if !matches!(self.week_starts_on, 0 | 1 | 6) {
            self.week_starts_on = base.week_starts_on;
        }
        if !matches!(self.theme.as_str(), "system" | "light" | "dark") {
            self.theme = base.theme.clone();
        }
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
            .and_then(|raw| serde_json::from_str::<AppSettings>(&raw).ok())
            .map(|parsed| parsed.normalize(&AppSettings::default()))
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
    fn rejects_an_unknown_format() {
        let base = AppSettings::default();
        let mut input = base.clone();
        input.menu_bar_format = "iso8601".into();
        assert_eq!(input.normalize(&base).menu_bar_format, base.menu_bar_format);
    }

    #[test]
    fn keeps_monday_as_a_week_start() {
        let base = AppSettings::default();
        let mut input = base.clone();
        input.week_starts_on = 1;
        assert_eq!(input.normalize(&base).week_starts_on, 1);
    }

    #[test]
    fn rejects_a_midweek_start() {
        let base = AppSettings::default();
        let mut input = base.clone();
        input.week_starts_on = 3;
        assert_eq!(input.normalize(&base).week_starts_on, 0);
    }

    #[test]
    fn writes_camel_case_keys() {
        let body = serde_json::to_string(&AppSettings::default()).expect("serializes");
        assert!(body.contains("\"menuBarFormat\""));
        assert!(body.contains("\"weekStartsOn\""));
        assert!(body.contains("\"launchAtLogin\""));
        assert!(!body.contains("menu_bar_format"));
    }

    #[test]
    fn reads_a_camel_case_settings_file() {
        let raw = r#"{
            "menuBarFormat": "monthDay",
            "weekStartsOn": 1,
            "showWeekNumbers": true,
            "dimWeekends": false,
            "launchAtLogin": true,
            "theme": "dark"
        }"#;
        let parsed: AppSettings = serde_json::from_str(raw).expect("parses");
        let settings = parsed.normalize(&AppSettings::default());
        assert_eq!(settings.menu_bar_format, "monthDay");
        assert_eq!(settings.week_starts_on, 1);
        assert!(settings.show_week_numbers);
        assert!(!settings.dim_weekends);
        assert!(settings.launch_at_login);
        assert_eq!(settings.theme, "dark");
    }
}
