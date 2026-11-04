import { Link } from "@tanstack/react-router";

export function CompactFooter() {
  return (
    <footer className="compact-footer">
      <p>© {new Date().getFullYear()} Outrazo <span aria-hidden="true">·</span> Discover experiences across Nigeria.</p>
      <nav aria-label="Footer navigation">
        <Link to="/events" search={{}}>Explore events</Link>
        <Link to="/app/create-event">Host an event</Link>
      </nav>
    </footer>
  );
}
