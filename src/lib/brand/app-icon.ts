// Light app icon (docs/design/landing/logo). Used by apple-icon and PWA icon routes.
export const APP_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22E3D9"></stop><stop offset="1" stop-color="#00B5AC"></stop></linearGradient></defs><rect width="512" height="512" rx="112" fill="#F5F7FA"></rect><g transform="translate(106 140) scale(2.5)"><path d="M8 4H36Q41 4 43 8L78 64Q80 67 78 71L68 86Q63 93 58 86L4 10Q1 4 8 4Z" fill="url(#g)"></path><path d="M90 4H114Q120 4 117 9L84 58Q81 62 78 58L71 47Q69 44 71 41L86 7Q87 4 90 4Z" fill="#2E4558"></path></g></svg>';

export const appIconDataUri = `data:image/svg+xml;base64,${Buffer.from(APP_ICON_SVG).toString("base64")}`;
