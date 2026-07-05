# iOS Development Guide

## Provisioning and Signing (7-Day Expiration)

If you are using a **Free Apple Developer Account**, your apps will expire exactly **7 days** after being installed on your device. When this happens, you will see a message: *"TripCast is No Longer Available"*.

### Automatic Renewal
We have automated the renewal process. To use it:

1. **Find your Team ID**:
   - Open the project in Xcode: `npx cap open ios`
   - Select the **App** target.
   - Go to **Signing & Capabilities**.
   - Look at the **Team** dropdown. Your Team ID is the 10-character alphanumeric code (e.g., `MU12345678`) associated with your name.

2. **Configure your environment**:
   - Create or edit a file named `.env.capacitor.local` in the root directory.
   - Add your Team ID:
     ```env
     DEVELOPMENT_TEAM=YOUR_TEAM_ID_HERE
     ```

3. **Run the app**:
   - Connect your iPhone via USB.
   - Run: `npm run ios:run`
   - This command will automatically:
     - Sync the latest web code.
     - Request a fresh 7-day provisioning profile from Apple using the `-allowProvisioningUpdates` flag.
     - Deploy the app to your connected device.

### Why do I have to "Trust" the developer again?
Normally, you only have to trust your developer email **once**.

If you are asked to trust it again, it usually means a **new Signing Certificate** was created. This often happens if you click "Fix Issue" in Xcode or if you manually deleted certificates in your Keychain.

By using `npm run ios:run` with the `DEVELOPMENT_TEAM` set, the script tries to reuse your existing certificate and only updates the *profile*, which should minimize how often you need to re-trust in Settings.

## Common Issues

### "The device is locked"
Ensure your iPhone is unlocked and you have tapped "Trust" on the phone when prompted after connecting the USB cable.

### "No profiles found"
Ensure you have signed into your Apple ID in **Xcode > Settings > Accounts** and that you have selected the correct Team ID in `.env.capacitor.local`.
