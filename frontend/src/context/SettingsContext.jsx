import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { getSystemSettings } from "../services/api.jsx";

// Fallback values shown before the API responds (or if it fails), so the UI
// never shows blank text while settings are loading.
const DEFAULTS = {
  barangay_name: "Barangay Binitayan",
  system_name: "Post-Disaster Monitoring and Relief Allocation with Decision Support System",
  barangay_address: "Barangay Hall, Binitayan, Daraga, Albay",
  office_hours: "Monday–Friday, 8:00 AM – 5:00 PM",
  contact_email: "admin@binitayan.gov.ph",
  contact_phone: "09171234567",
  emergency_hotline: "911 / Daraga MDRRM Office",
  default_minimum_level: "10",
  default_unit: "pcs",
  // Public home page advisories (one per line); editable in System Settings.
  // Wording to be confirmed by barangay officials.
  public_advisory_steps:
    "Move valuables and documents to higher ground.\nPrepare to go to the nearest evacuation center.\nFollow instructions from barangay officials.",
  public_advisory_steps_warning:
    "Stay alert and listen for announcements from barangay officials.\nPrepare a go-bag: water, food, medicine, a flashlight and important documents.\nKnow the way to the nearest evacuation center.",
  public_preparedness_tips:
    "Register your household so the barangay can locate and assess you quickly.\nKeep an emergency go-bag ready at home.\nKnow the nearest evacuation center and the safest way to get there.",
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    return getSystemSettings()
      .then((res) => setSettings({ ...DEFAULTS, ...res.data.data }))
      .catch(() => setSettings(DEFAULTS))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <SettingsContext.Provider value={{ settings, loading, refresh }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
