'use client';
/**
 * Small navigation helpers on top of Next.js (next/link and next/navigation).
 * The screens use these instead of calling Next.js directly, so links, page addresses
 * and ?tab=… filters work the same way everywhere.
 */
import NextLink from 'next/link';
import { useParams as useNextParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, type ComponentProps, type ReactNode } from 'react';

type AnchorProps = Omit<ComponentProps<typeof NextLink>, 'href' | 'className'>;

/** Turns an old "#/path" link (still found in saved website pages) into a normal "/path" address. */
export function appHref(href: string): string {
  return href.startsWith('#/') ? href.slice(1) : href;
}

export function Link({ to, className, ...rest }: AnchorProps & { to: string; className?: string }) {
  return <NextLink href={appHref(to)} className={className} {...rest} />;
}

/** True when `to` is the current page (or, unless `end`, a parent of it). */
export function isActivePath(pathname: string, to: string, end?: boolean): boolean {
  const target = to.split('?')[0];
  if (target === '/' || end) return pathname === target;
  return pathname === target || pathname.startsWith(target + '/');
}

export function NavLink({
  to,
  end,
  className,
  children,
  ...rest
}: AnchorProps & { to: string; end?: boolean; className?: string | ((s: { isActive: boolean }) => string); children?: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const isActive = isActivePath(pathname, to, end);
  return (
    <NextLink href={to} className={typeof className === 'function' ? className({ isActive }) : className} aria-current={isActive ? 'page' : undefined} {...rest}>
      {children}
    </NextLink>
  );
}

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: string | number, opts?: { replace?: boolean }) => {
      if (typeof to === 'number') {
        if (to < 0) router.back();
        else router.forward();
        return;
      }
      const href = appHref(to);
      if (opts?.replace) router.replace(href);
      else router.push(href);
    },
    [router],
  );
}

/** Page address parts, e.g. the `id` in /dancers/[id]. */
export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>(): T {
  const raw = useNextParams() ?? {};
  return useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(raw)) out[k] = Array.isArray(v) ? v.join('/') : (v as string | undefined);
    return out as T;
  }, [raw]);
}

type ParamsInit = URLSearchParams | Record<string, string> | string | [string, string][];

/** Read and update ?key=value filters in the address, like ?tab=history. */
export function useSearchParams(): [URLSearchParams, (next: ParamsInit | ((prev: URLSearchParams) => ParamsInit), opts?: { replace?: boolean }) => void] {
  const current = useNextSearchParams();
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const params = useMemo(() => new URLSearchParams(current?.toString() ?? ''), [current]);
  const setParams = useCallback(
    (next: ParamsInit | ((prev: URLSearchParams) => ParamsInit), opts?: { replace?: boolean }) => {
      const value = typeof next === 'function' ? next(new URLSearchParams(params)) : next;
      const qs = new URLSearchParams(value as ConstructorParameters<typeof URLSearchParams>[0]).toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (opts?.replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [params, pathname, router],
  );
  return [params, setParams];
}

export function useLocation() {
  const pathname = usePathname() ?? '/';
  const sp = useNextSearchParams();
  const qs = sp?.toString() ?? '';
  return useMemo(() => ({ pathname, search: qs ? `?${qs}` : '', hash: '' }), [pathname, qs]);
}

/** Sends the person to another page as soon as this renders. */
export function Navigate({ to, replace }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace });
  }, [navigate, to, replace]);
  return null;
}
