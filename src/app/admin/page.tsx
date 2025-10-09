import { AdminPageClient } from './AdminPageClient';

/**
 * Server entry point for the admin area. Delegates to the client-side
 * authentication wrapper so build-time typing works while UI logic stays
 * in the browser.
 */
export default function AdminPage() {
  return <AdminPageClient />;
}
