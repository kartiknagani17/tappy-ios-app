import { Linking } from 'react-native';
import { colors } from '../theme';

export type LegalDocId = 'terms' | 'privacy';

/** The server publishes the same Terms and Privacy text as server/src/legal/content.ts. */
export const LEGAL_URLS: Record<LegalDocId, string> = {
  terms: 'https://tappy.company/terms',
  privacy: 'https://tappy.company/privacy',
};

type WebBrowserModule = typeof import('expo-web-browser');
let webBrowser: WebBrowserModule | null | undefined;
/** expo-web-browser is native code; a build without it falls back to Safari instead of crashing. */
function loadWebBrowser(): WebBrowserModule | null {
  if (webBrowser !== undefined) return webBrowser;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    webBrowser = require('expo-web-browser') as WebBrowserModule;
  } catch {
    webBrowser = null;
  }
  return webBrowser;
}

/**
 * Open the Terms of Use or Privacy Policy in an in-app Safari sheet. Unlike a React Native <Modal>,
 * it is presented on top of whatever is showing, including bottom sheets (Settings, the exit offer),
 * so the link always opens.
 */
export async function openLegal(doc: LegalDocId) {
  const url = LEGAL_URLS[doc];
  const wb = loadWebBrowser();
  if (wb) {
    try {
      await wb.openBrowserAsync(url, {
        presentationStyle: wb.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: colors.ink,
        dismissButtonStyle: 'close',
      });
      return;
    } catch {
      // fall through to Safari
    }
  }
  Linking.openURL(url).catch(() => {});
}
