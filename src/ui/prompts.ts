import * as clack from '@clack/prompts';
import { banner, dim, green, red, yellow } from './theme.js';

export { banner, dim, green, red, yellow };

/** True when the process can prompt interactively. */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

export function intro(message: string): void {
  clack.intro(message);
}

export function outro(message: string): void {
  clack.outro(message);
}

export function note(message: string, title?: string): void {
  clack.note(message, title);
}

export function log(message: string): void {
  clack.log.info(message);
}

export function warn(message: string): void {
  clack.log.warn(message);
}

export function success(message: string): void {
  clack.log.success(message);
}

export function fail(message: string): void {
  clack.log.error(message);
}

export function spinner(): ReturnType<typeof clack.spinner> {
  return clack.spinner();
}

/** Unwraps a clack prompt result, exiting cleanly on cancel. */
export function unwrap<T>(value: T | symbol): Exclude<T, symbol> {
  if (clack.isCancel(value)) {
    clack.cancel('Cancelled.');
    process.exit(130);
  }
  return value as Exclude<T, symbol>;
}

export async function text(options: {
  message: string;
  placeholder?: string;
  defaultValue?: string;
  initialValue?: string;
}): Promise<string> {
  return unwrap(
    await clack.text({
      message: options.message,
      ...(options.placeholder !== undefined ? { placeholder: options.placeholder } : {}),
      ...(options.defaultValue !== undefined ? { defaultValue: options.defaultValue } : {}),
      ...(options.initialValue !== undefined ? { initialValue: options.initialValue } : {}),
    }),
  );
}

export async function password(options: {
  message: string;
  placeholder?: string;
}): Promise<string> {
  return unwrap(
    await clack.password({
      message: options.message,
      ...(options.placeholder !== undefined ? { placeholder: options.placeholder } : {}),
    }),
  );
}

export async function confirm(options: {
  message: string;
  initialValue?: boolean;
}): Promise<boolean> {
  return unwrap(
    await clack.confirm({
      message: options.message,
      ...(options.initialValue !== undefined ? { initialValue: options.initialValue } : {}),
    }),
  );
}

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string | undefined;
}

export async function select<T extends string>(options: {
  message: string;
  options: Choice<T>[];
  initialValue?: T;
}): Promise<T> {
  return unwrap(
    await clack.select({
      message: options.message,
      options: options.options as Parameters<typeof clack.select<T>>[0]['options'],
      ...(options.initialValue !== undefined ? { initialValue: options.initialValue } : {}),
    }),
  ) as T;
}

export async function multiselect<T extends string>(options: {
  message: string;
  options: Choice<T>[];
  initialValues?: T[];
}): Promise<T[]> {
  return unwrap(
    await clack.multiselect({
      message: options.message,
      options: options.options as unknown as Parameters<
        typeof clack.multiselect<T>
      >[0]['options'],
      required: false,
      ...(options.initialValues !== undefined ? { initialValues: options.initialValues } : {}),
    }),
  ) as T[];
}
