export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
export const GIT_SHA = process.env.NEXT_PUBLIC_GIT_SHA ?? "";
export const APP_VERSION_LABEL = GIT_SHA ? `${APP_VERSION}+${GIT_SHA}` : APP_VERSION;
