/** Ambient `console` без DOM lib — только то, что реально используется в src. */
declare const console: {
	warn(...data: unknown[]): void
}
