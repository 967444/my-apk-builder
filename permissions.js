// Catalog of Android permissions the builder can inject into AndroidManifest.xml.
// key -> { name, label, detail, group, dangerous }. The server only accepts keys from this list.
const P = (key, label, detail, group, dangerous = false, name = `android.permission.${key}`) => ({
  key,
  name,
  label,
  detail,
  group,
  dangerous,
});

const PERMISSIONS = [
  // Network
  P('INTERNET', 'Internet', 'Open network sockets, call APIs, load remote content', 'Network'),
  P('ACCESS_NETWORK_STATE', 'Network state', 'Read connectivity status', 'Network'),
  P('ACCESS_WIFI_STATE', 'Wi-Fi state', 'Read Wi-Fi connection info', 'Network'),
  P('CHANGE_WIFI_STATE', 'Change Wi-Fi state', 'Connect / disconnect Wi-Fi networks', 'Network'),
  P('CHANGE_NETWORK_STATE', 'Change network state', 'Change network connectivity', 'Network'),
  P('NEARBY_WIFI_DEVICES', 'Nearby Wi-Fi devices', 'Android 13+ Wi-Fi device discovery', 'Network', true),
  P('CHANGE_WIFI_MULTICAST_STATE', 'Wi-Fi multicast', 'Receive Wi-Fi multicast packets', 'Network'),

  // Camera & media capture
  P('CAMERA', 'Camera', 'Take photos, record video, scan codes', 'Camera & Microphone', true),
  P('RECORD_AUDIO', 'Microphone', 'Record audio and voice', 'Camera & Microphone', true),
  P('MODIFY_AUDIO_SETTINGS', 'Audio settings', 'Change global audio settings', 'Camera & Microphone'),
  P('CAPTURE_AUDIO_OUTPUT', 'Capture audio output', 'Capture audio played by the device (system apps)', 'Camera & Microphone'),

  // Notifications
  P('POST_NOTIFICATIONS', 'Notifications', 'Android 13+ runtime notification permission', 'Notifications', true),
  P('ACCESS_NOTIFICATION_POLICY', 'Do Not Disturb access', 'Read/modify notification policy', 'Notifications'),
  P('USE_FULL_SCREEN_INTENT', 'Full-screen notifications', 'Alarms / calls that take over the screen', 'Notifications'),

  // Storage, photos, files
  P('READ_MEDIA_IMAGES', 'Photos (gallery)', 'Android 13+ image access', 'Storage & Gallery', true),
  P('READ_MEDIA_VIDEO', 'Videos (gallery)', 'Android 13+ video access', 'Storage & Gallery', true),
  P('READ_MEDIA_AUDIO', 'Music & audio files', 'Android 13+ audio access', 'Storage & Gallery', true),
  P('READ_MEDIA_VISUAL_USER_SELECTED', 'Selected photos only', 'Android 14+ partial photo picker access', 'Storage & Gallery', true),
  P('ACCESS_MEDIA_LOCATION', 'Media location metadata', 'Read GPS EXIF from media', 'Storage & Gallery', true),
  P('READ_EXTERNAL_STORAGE', 'Read storage (legacy)', 'Files & photos on Android 12 and older', 'Storage & Gallery', true),
  P('WRITE_EXTERNAL_STORAGE', 'Write storage (legacy)', 'Save files on Android 9 and older', 'Storage & Gallery', true),
  P('MANAGE_EXTERNAL_STORAGE', 'All files access', 'Manage every file on shared storage (special)', 'Storage & Gallery', true),
  P('MANAGE_DOCUMENTS', 'Manage documents', 'Document provider management', 'Storage & Gallery'),

  // Location
  P('ACCESS_FINE_LOCATION', 'Precise location', 'GPS-level location', 'Location', true),
  P('ACCESS_COARSE_LOCATION', 'Approximate location', 'Network-based location', 'Location', true),
  P('ACCESS_BACKGROUND_LOCATION', 'Background location', 'Location while app is not visible', 'Location', true),
  P('ACCESS_LOCATION_EXTRA_COMMANDS', 'Location extra commands', 'Extra location provider commands', 'Location'),

  // Contacts, calendar, call logs
  P('READ_CONTACTS', 'Read contacts', 'Read the contact list', 'Contacts & Calendar', true),
  P('WRITE_CONTACTS', 'Write contacts', 'Create or edit contacts', 'Contacts & Calendar', true),
  P('GET_ACCOUNTS', 'Device accounts', 'List accounts on the device', 'Contacts & Calendar', true),
  P('READ_CALENDAR', 'Read calendar', 'Read calendar events', 'Contacts & Calendar', true),
  P('WRITE_CALENDAR', 'Write calendar', 'Create or edit calendar events', 'Contacts & Calendar', true),
  P('READ_CALL_LOG', 'Read call log', 'Read call history', 'Phone & SMS', true),
  P('WRITE_CALL_LOG', 'Write call log', 'Modify call history', 'Phone & SMS', true),

  // Phone & SMS
  P('READ_PHONE_STATE', 'Phone state', 'Read device / call state', 'Phone & SMS', true),
  P('READ_PHONE_NUMBERS', 'Phone numbers', 'Read the device phone number', 'Phone & SMS', true),
  P('CALL_PHONE', 'Make calls', 'Start phone calls directly', 'Phone & SMS', true),
  P('ANSWER_PHONE_CALLS', 'Answer calls', 'Answer incoming calls', 'Phone & SMS', true),
  P('ADD_VOICEMAIL', 'Voicemail', 'Add voicemails', 'Phone & SMS', true),
  P('USE_SIP', 'SIP calling', 'Use SIP service', 'Phone & SMS', true),
  P('PROCESS_OUTGOING_CALLS', 'Outgoing calls (legacy)', 'See / redirect outgoing calls', 'Phone & SMS', true),
  P('SEND_SMS', 'Send SMS', 'Send text messages', 'Phone & SMS', true),
  P('RECEIVE_SMS', 'Receive SMS', 'Receive text messages', 'Phone & SMS', true),
  P('READ_SMS', 'Read SMS', 'Read stored text messages', 'Phone & SMS', true),
  P('RECEIVE_MMS', 'Receive MMS', 'Receive multimedia messages', 'Phone & SMS', true),
  P('RECEIVE_WAP_PUSH', 'Receive WAP push', 'Receive WAP push messages', 'Phone & SMS', true),

  // Bluetooth & NFC
  P('BLUETOOTH', 'Bluetooth (legacy)', 'Android 11 and older Bluetooth access', 'Bluetooth & NFC'),
  P('BLUETOOTH_ADMIN', 'Bluetooth admin (legacy)', 'Discover / pair devices on Android 11-', 'Bluetooth & NFC'),
  P('BLUETOOTH_CONNECT', 'Bluetooth connect', 'Connect to paired devices (Android 12+)', 'Bluetooth & NFC', true),
  P('BLUETOOTH_SCAN', 'Bluetooth scan', 'Discover nearby devices (Android 12+)', 'Bluetooth & NFC', true),
  P('BLUETOOTH_ADVERTISE', 'Bluetooth advertise', 'Be discoverable (Android 12+)', 'Bluetooth & NFC', true),
  P('NFC', 'NFC', 'Read / write NFC tags', 'Bluetooth & NFC'),
  P('UWB_RANGING', 'Ultra-wideband ranging', 'UWB device ranging', 'Bluetooth & NFC', true),

  // Sensors & health
  P('BODY_SENSORS', 'Body sensors', 'Heart rate and similar sensors', 'Sensors & Health', true),
  P('BODY_SENSORS_BACKGROUND', 'Body sensors (background)', 'Sensors while in background', 'Sensors & Health', true),
  P('ACTIVITY_RECOGNITION', 'Activity recognition', 'Detect steps, walking, cycling', 'Sensors & Health', true),
  P('HIGH_SAMPLING_RATE_SENSORS', 'High-rate sensors', 'Sensor sampling above 200 Hz', 'Sensors & Health'),
  P('USE_BIOMETRIC', 'Biometric', 'Fingerprint / face authentication', 'Sensors & Health'),
  P('USE_FINGERPRINT', 'Fingerprint (legacy)', 'Older fingerprint API', 'Sensors & Health'),

  // Background, alarms, services
  P('FOREGROUND_SERVICE', 'Foreground service', 'Run a visible ongoing service', 'Background & System'),
  P('FOREGROUND_SERVICE_LOCATION', 'FGS: location', 'Foreground service type location (Android 14+)', 'Background & System'),
  P('FOREGROUND_SERVICE_CAMERA', 'FGS: camera', 'Foreground service type camera', 'Background & System'),
  P('FOREGROUND_SERVICE_MICROPHONE', 'FGS: microphone', 'Foreground service type microphone', 'Background & System'),
  P('FOREGROUND_SERVICE_MEDIA_PLAYBACK', 'FGS: media playback', 'Foreground service type media playback', 'Background & System'),
  P('FOREGROUND_SERVICE_DATA_SYNC', 'FGS: data sync', 'Foreground service type data sync', 'Background & System'),
  P('FOREGROUND_SERVICE_MEDIA_PROJECTION', 'FGS: screen capture', 'Foreground service type media projection', 'Background & System'),
  P('FOREGROUND_SERVICE_PHONE_CALL', 'FGS: phone call', 'Foreground service type phone call', 'Background & System'),
  P('FOREGROUND_SERVICE_CONNECTED_DEVICE', 'FGS: connected device', 'Foreground service type connected device', 'Background & System'),
  P('FOREGROUND_SERVICE_HEALTH', 'FGS: health', 'Foreground service type health', 'Background & System'),
  P('FOREGROUND_SERVICE_REMOTE_MESSAGING', 'FGS: remote messaging', 'Foreground service type remote messaging', 'Background & System'),
  P('FOREGROUND_SERVICE_SPECIAL_USE', 'FGS: special use', 'Foreground service type special use', 'Background & System'),
  P('RECEIVE_BOOT_COMPLETED', 'Start on boot', 'Run after device restart', 'Background & System'),
  P('WAKE_LOCK', 'Wake lock', 'Keep CPU / screen awake', 'Background & System'),
  P('SCHEDULE_EXACT_ALARM', 'Exact alarms', 'Schedule exact alarms (Android 12+)', 'Background & System'),
  P('USE_EXACT_ALARM', 'Exact alarms (alarm apps)', 'Exact alarms for alarm / calendar apps (Android 13+)', 'Background & System'),
  P('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'Ignore battery optimizations', 'Ask to be excluded from Doze', 'Background & System'),
  P('SYSTEM_ALERT_WINDOW', 'Draw over other apps', 'Overlay windows (special permission)', 'Background & System', true),
  P('REQUEST_INSTALL_PACKAGES', 'Install packages', 'Request APK installs (special permission)', 'Background & System', true),
  P('REQUEST_DELETE_PACKAGES', 'Uninstall packages', 'Request app uninstall', 'Background & System'),
  P('QUERY_ALL_PACKAGES', 'Query all packages', 'See every installed app (Android 11+)', 'Background & System'),
  P('PACKAGE_USAGE_STATS', 'Usage stats', 'App usage statistics (special permission)', 'Background & System'),
  P('KILL_BACKGROUND_PROCESSES', 'Kill background processes', 'Stop other apps\u2019 background processes', 'Background & System'),
  P('REORDER_TASKS', 'Reorder tasks', 'Bring tasks to front', 'Background & System'),
  P('EXPAND_STATUS_BAR', 'Expand status bar', 'Open / close the status bar', 'Background & System'),
  P('DISABLE_KEYGUARD', 'Disable lock screen', 'Dismiss non-secure keyguard', 'Background & System'),
  P('SET_WALLPAPER', 'Set wallpaper', 'Change the device wallpaper', 'Background & System'),
  P('SET_WALLPAPER_HINTS', 'Wallpaper hints', 'Set wallpaper size hints', 'Background & System'),
  P('SET_ALARM', 'Set alarm', 'Add alarms in the clock app', 'Background & System', false, 'com.android.alarm.permission.SET_ALARM'),
  P('READ_SYNC_SETTINGS', 'Read sync settings', 'Read account sync settings', 'Background & System'),
  P('WRITE_SYNC_SETTINGS', 'Write sync settings', 'Change account sync settings', 'Background & System'),
  P('READ_SYNC_STATS', 'Read sync stats', 'Read sync statistics', 'Background & System'),
  P('INSTALL_SHORTCUT', 'Install shortcut', 'Add home screen shortcuts', 'Background & System', false, 'com.android.launcher.permission.INSTALL_SHORTCUT'),
  P('READ_BASIC_PHONE_STATE', 'Basic phone state', 'Read basic telephony state (Android 13+)', 'Phone & SMS'),
  P('DETECT_SCREEN_CAPTURE', 'Detect screen capture', 'Get notified when screenshots are taken (Android 14+)', 'Background & System'),

  // Device features
  P('VIBRATE', 'Vibration', 'Haptic feedback', 'Device'),
  P('FLASHLIGHT', 'Flashlight', 'Control the camera flash (legacy)', 'Device'),
  P('USE_CREDENTIALS', 'Use credentials (legacy)', 'Request auth tokens', 'Device'),
  P('BIND_ACCESSIBILITY_SERVICE', 'Accessibility service binding', 'Declare an accessibility service', 'Device'),
  P('ACCEPT_HANDOVER', 'Accept handover', 'Continue a call from another app', 'Device', true),
  P('TRANSMIT_IR', 'Infrared', 'Use the IR transmitter', 'Device'),
  P('READ_NEARBY_STREAMING_POLICY', 'Nearby streaming policy', 'Read nearby streaming policy', 'Device'),
  P('MANAGE_OWN_CALLS', 'Manage own calls', 'Self-managed ConnectionService', 'Device'),
  P('RUN_USER_INITIATED_JOBS', 'User-initiated jobs', 'Long-running data transfer jobs (Android 14+)', 'Device'),
  P('CREDENTIAL_MANAGER_SET_ORIGIN', 'Credential Manager origin', 'Set origin for credential requests', 'Device'),
  P('BILLING', 'Google Play Billing', 'In-app purchases', 'Device', false, 'com.android.vending.BILLING'),
  P('CHECK_LICENSE', 'Google Play licensing', 'Play licensing verification', 'Device', false, 'com.android.vending.CHECK_LICENSE'),
  P('C2D_MESSAGE', 'Cloud messaging (legacy)', 'Legacy GCM receive', 'Device', false, 'com.google.android.c2dm.permission.RECEIVE'),
];

const byKey = new Map(PERMISSIONS.map((p) => [p.key, p]));

function resolvePermissions(keys) {
  const accepted = [];
  const rejected = [];
  for (const key of Array.isArray(keys) ? keys : []) {
    const p = byKey.get(String(key));
    if (p) accepted.push(p);
    else rejected.push(String(key));
  }
  return { accepted, rejected };
}

module.exports = { PERMISSIONS, resolvePermissions };
