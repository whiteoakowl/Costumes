# Studio Costume Manager

A web app for a dance studio to organize, track and plan every costume used in classes, productions, recitals and competitions.

## What's inside

| Section | What you can do |
| --- | --- |
| **Dashboard** | Live totals (dancers, costumes, ready, in progress, upcoming shows, active performances), costumes needing repairs or being altered, recently updated costumes, upcoming performances with readiness, quick actions |
| **Dancers** | Searchable and sortable table; filter by level, age range, size and pointe; bulk level changes; CSV export. Each dancer's profile shows every costume, show, cast and costume note related to them |
| **Costumes** | Inventory with automatic IDs (`COS-0001`…), categories (show types), accessories with quantities, storage location, READY / IN PROGRESS status buttons (with reason and note), and a dated notes and history log that is never overwritten. View all costumes, or group by show type, size or storage. Ready / in-progress views, bulk status changes, bulk moves between locations or categories, duplicate, CSV export |
| **Props** | Same features as costumes: automatic IDs (`PROP-0001`…), categories, parts with quantities, storage location, READY / IN PROGRESS status, dated notes log, duplicate, bulk actions, CSV export. On shows and performances, props can go to a single cast member, a whole cast, or stay unassigned as stage / set props. A props overview warns about props in progress, missing parts and too few on hand |
| **Shows** | Shows with type, dates, venue, notes and status (Planning, Active, Completed). Multiple cast lists per show, a costume list, costume assignments to dancers or whole casts, and readiness |
| **Performance Planning** | Performance plans with date, time, venue, address, call time and dress rehearsal. Multiple cast lists (add, remove, move, rename, duplicate), costume assignments (one dancer can wear several costumes; a whole cast can share one), and a costume overview table with warnings for missing costumes, missing accessories, too few on hand, size checks and costumes in progress. Readiness percentage and CSV exports |
| **Storage Locations** | Closets, racks and bins with costume counts. Move costumes between locations. Deleting a location always asks where its costumes should go |
| **Volunteers** | Name, email, phone, preferred contact, skills, and date/time availability (specific dates or every week). Filter by skill or by who is available on a given date and time. Email the volunteers shown in one click, export to CSV. Each performance plan lists the volunteers available on performance day and at dress rehearsal |
| **Settings** | Studio name, costume and prop ID prefixes, dancer levels, size options, volunteer skills, categories, CSV exports, full JSON backup and restore, remove or reload sample data |

## Data storage

- All data is stored as **relational tables** linked by unique IDs: dancers, categories, costumes and props, accessories / parts, notes, storage locations, shows, performance plans, cast lists, cast memberships, costume and prop assignments, and volunteers. Costumes and props share one inventory table, marked by `kind`. See `src/data/types.ts`.
- Every change is **saved automatically** in the browser (localStorage). Data survives refreshes and closing the browser, and stays in sync across open tabs.
- Deleting a record never leaves broken links. Related assignments are cleaned up, and costumes from a deleted category or location are reassigned (or left unassigned) and the change is logged.
- Data lives **on the device and browser where it was entered**. Use **Settings → Download full backup** regularly. Use **Restore from backup** to move the data to another computer.

## Sample data

On first launch the app loads 8 dancers, 12 costumes, 6 props, 4 volunteers, 3 categories, 3 storage locations, 2 shows with cast lists, and a performance plan with costume assignments. Every sample record has a **Sample** tag. **Settings → Remove sample data** deletes it all and keeps anything you entered yourself.

## Running it

```bash
npm install
npm run dev      # local development server
npm test         # data-layer tests
npm run build    # production build in dist/
```

The build is a static site, so it can be hosted anywhere. Pushes to `main` are tested, then deployed to GitHub Pages by `.github/workflows/deploy.yml`. In the repository settings, set **Pages → Source** to **GitHub Actions** once.

## Tech

React + TypeScript + Vite, React Router (hash routing), lucide icons, and Cormorant Garamond + DM Sans fonts (bundled, so no external font requests).
