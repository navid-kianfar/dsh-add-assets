/**
 * Which accelerator key this machine uses, which decides both how a chord is matched and how it is
 * spelled on a menu row.
 * @module @achasoft/dsh-add-assets/client/platform
 */

/** The two navigator fields consulted, so the check stays testable without a browser. */
export interface PlatformSource {
  readonly platform?: string | undefined
  readonly userAgent?: string | undefined
  readonly userAgentData?: { readonly platform?: string | undefined } | undefined
}

/**
 * Whether `mod` means Command on this machine.
 *
 * `userAgentData.platform` is consulted first because it is the field browsers still populate
 * accurately; `platform` and the user-agent string are the fallbacks for engines that froze or
 * dropped it. iPadOS reports a Macintosh platform, which is the answer this check wants anyway.
 * @param source - the navigator, or its two relevant fields.
 * @returns true on Apple hardware.
 */
export function isApplePlatform(source: PlatformSource): boolean {
  const declared = source.userAgentData?.platform ?? source.platform ?? source.userAgent ?? ''
  return /mac|iphone|ipad|ipod/iu.test(declared)
}
