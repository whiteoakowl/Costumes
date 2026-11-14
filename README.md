# Studio Manager (formerly Studio Costume Manager)

A dance studio management platform. It started as a costume manager and is growing into an all-in-one system for running a studio: families, staff, classes, the annual calendar, attendance, teacher hours, and every portal's view of them, alongside the original costume, prop and production tools.

## Portals & roles

One central database feeds five portals. **Viewing as** (bottom of the sidebar) switches between accounts to preview each portal.

| Portal | Roles | What they see |
| --- | --- | --- |
| Studio Management | Owner / Director | Everything, including Accounts & Access and Settings |
| Office Portal | Office Administrator, Office Assistant | Day-to-day administration; permissions configurable per account |
| Teacher Portal | Teacher, Assistant Teacher | Today's classes, their schedule, rosters (with costumes), attendance for their classes, their own hours, announcements and schedule-change notices |
| Parent Portal | Parent / Guardian, Dancer | Only their own family: dancers, classes, schedule, attendance (read-only), recital costumes and props, notices, contact details and emergency contacts |
| Performance Portal | Performance Staff | Shows, performance planning, costumes, props, repairs, storage, volunteers and reports, with no family or financial records |

> **Browser-only mode.** Data is stored in the browser on this device, so "Viewing as" is a preview, not a secure login. Real sign-in, invitations, password resets, cross-device access and true privacy between families need a server database (for example Supabase). The data model is already relational with ID links so it can be moved there.

## Studio management (new)

| Section | What you can do |
| --- | --- |
| **Accounts & Access** | Create, edit, deactivate, reactivate and delete accounts. Assign roles, link logins to a staff member / parent / dancer, customise each account's permissions, preview any portal with "View as", see recent account activity |
| **Families** | Family profiles with several parents/guardians (one primary, email/SMS consent), emergency contacts, linked dancers (new or existing), their classes and waiting lists, restricted medical & allergy info, and linked parent logins |
| **Teachers & Staff** | Separate lists for teachers, assistants, substitutes and other staff. Contact, hire date, styles, qualifications, pay type and rate (pay visible only with payroll permission), assigned classes, next two weeks, class history with attendance status, students |
| **School Years** | Create, make current, archive (history kept) and copy classes between years. Registration dates, tuition and recital notes, holidays, closures and important dates. Classrooms |
| **Classes** | Classes by school year with style, level, ages, day, time, room, teacher, assistant, capacity and tuition. Live conflict checks stop double-booking teachers, assistants and rooms; an override is possible but logged. Duplicate. Rosters with enroll, remove, move to another class, automatic waiting list and promote from waiting list. Attendance rate per dancer. Classes with attendance history can't be deleted |
| **Calendar** | Year, month, week and day views of every class, closure, rehearsal, master class, workshop, important date and performance. Closures automatically cancel classes. Click a class to cancel that date, reschedule it, change its room or assign a substitute. Drag and drop in week view to move one week's class, with conflict checks. Teachers and families automatically get in-app notices |
| **Attendance** | Present / Absent / Late / Excused / Makeup with notes, per class date. Teachers can edit for 7 days; the office can edit any time. Studio-wide records with filters (class, dancer, teacher, status, date range / month / school year), per-dancer rates and CSV export. Parents see their dancers' history read-only |
| **Teacher Hours & Payroll** | Fill in class hours from the schedule (substitutes counted separately), teacher-submitted extra, rehearsal and private-lesson hours and corrections, approve and reject (with reason), edit approved hours only with a reason (full audit trail), pay-period navigation, filters, payroll summary and detail CSV exports. Nothing is paid automatically |
| **Dashboard** | Studio stats (enrolled dancers, families, teachers, assistants, classes, 30-day attendance, upcoming events, hours to approve), today's classes with attendance status, quick actions, announcements and an activity feed, above the existing costume & production overview |

## Costumes & productions

## What's inside

| Section | What you can do |
| --- | --- |
| **Dashboard** | Live totals (dancers, costumes, ready, in progress, upcoming shows, active performances), costumes needing repairs or being altered, recently updated costumes, upcoming performances with readiness, quick actions |
| **Dancers** | Searchable and sortable table; filter by level, age range, size and pointe; bulk level changes; CSV export. Each dancer's profile shows every costume, show, cast and costume note related to them |
| **Costumes** | Inventory with automatic IDs (`COS-0001`…), categories (show types), accessories with quantities, storage location, READY / IN PROGRESS status buttons (with reason and note), and a dated notes and history log that is never overwritten. View all costumes, or group by show type, size or storage. Ready / in-progress views, bulk status changes, bulk moves between locations or categories, duplicate, CSV export |
| **Props** | Same features as costumes: automatic IDs (`PROP-0001`…), categories, parts with quantities, storage location, READY / IN PROGRESS status, dated notes log, duplicate, bulk actions, CSV export. On shows and performances, props can go to a single cast member, a whole cast, or stay unassigned as stage / set props. A props overview warns about props in progress, missing parts and too few on hand |
| **Repair & Cleaning** | Work orders for cleaning, repairs, alterations and replacements. Each one records the volunteer, scheduled date/time, due date, start and completion times and notes. Assign volunteers right from the list. Marking an item IN PROGRESS opens a work order and marking it READY closes it. Tabs for open work, completed work and an **activity log** of every tracked change across all costumes and props, filterable by type, volunteer and dates |
| **Shows** | Shows with type, dates, venue, notes and status (Planning, Active, Completed). Multiple cast lists per show, a costume list, costume assignments to dancers or whole casts, and readiness |
| **Performance Planning** | Performance plans with date, time, venue, address, call time and dress rehearsal. Multiple cast lists (add, remove, move, rename, duplicate), costume assignments (one dancer can wear several costumes; a whole cast can share one), and a costume overview table with warnings for missing costumes, missing accessories, too few on hand, size checks and costumes in progress. Readiness percentage and CSV exports |
| **Storage Locations** | Closets, racks and bins with costume counts. Move costumes between locations. Deleting a location always asks where its costumes should go |
| **Volunteers** | Name, email, phone, preferred contact, skills, and date/time availability (specific dates or every week). Filter by skill or by who is available on a given date and time. Email the volunteers shown in one click, export to CSV. Each performance plan lists the volunteers available on performance day and at dress rehearsal |
| **Reports & Printing** | Print-ready layouts (choose “Save as PDF” in the print window for a PDF): dancer list, dancer sheet, costume and prop inventory, item sheet with history, repair & cleaning list, activity log, show list, show sheet, cast lists (one page per cast, with check-off boxes), performance schedule, performance call sheet, storage inventory and volunteer contact list. Print buttons also appear on each page |
| **Photos** | Upload photos (or take one on a phone) for every costume, prop and dancer. Pick a main photo, add captions, view full size. Main photos appear as thumbnails in lists and can be included in printouts |
| **Settings** | Studio name, costume and prop ID prefixes, dancer levels, size options, volunteer skills, categories, CSV exports, full JSON backup and restore, remove or reload sample data |

## Platform modules

| Section | What you can do |
| --- | --- |
| **Invoices & Payments** | Financial dashboard with charts (revenue by month, category, event/program and school year), outstanding and overdue balances. Invoices with multiple lines, discounts, tax, due dates, drafts, send, void (with reason), duplicate and full history. Monthly tuition generation (no double-billing, sibling discount), costume invoicing for a whole class or recital, late fees. Record cash/check/bank/card-terminal payments, partial payments, refunds (partial or full), family credits (issue, apply, move between invoices, remove — all audited). Printable invoices, receipts and family statements; CSV exports. Parents see balances, invoices, receipts and pay online in **test mode** |
| **Recitals** | Recital theme, dates, venue, times, rehearsals, picture day and ticket info. Numbers per class or team with song, artist, music file, teacher, costume from inventory (never duplicated), accessories, shoes/tights, hair/makeup, entrances and duration; drag to reorder; one click adds a number for every class |
| **Show Day & Backstage** | Running order built from a recital (with intermissions), drag-and-drop reorder with calculated start times, quick-change detection with tight changes flagged, quick-change helpers and locations, dancer check-in (checked in → backstage → ready → on stage → finished → released) with bulk actions and dressing rooms, backstage crew roles, warm-up/stage rehearsal/stage manager/instructions. Printable running order, audience program, check-in sheet and quick-change plan |
| **Costume Checkout** | Reserve, check out and return costumes with accessories checklist, condition in/out, missing items, due dates and overdue tracking; returns can open a repair job. Availability for every costume, reserve everything for a performance in one click, and conflict alerts (double-booked across same-day performances, not enough pieces, in repair, checked out elsewhere, accessories short) with recorded overrides |
| **Teams & Companies** | Rosters, coaches, classes, requirements, rehearsal and competition schedules, fees (invoice the whole team), move dancers between teams, archive |
| **Events & Sign-ups** | Competitions, workshops, parties, picture day and more with eligibility (all / classes / teams / chosen dancers), deadlines, capacity with automatic waiting list, custom questions, and automatic invoicing. Parents sign up, decline or cancel; the next person on the waiting list moves up |
| **Registration** | Public online registration form (`#/register`) and parent-portal registration and class changes. Office review approves without creating duplicate families or dancers, enrolls or waitlists, records policy agreements and invoices the registration fee |
| **Policies & Signatures** | Versioned policies for all families, classes, teams or chosen families; typed e-signatures with name, date/time and version; annual renewal; deadlines; paper signatures recorded by the office; editing the text creates a new version that must be signed again |
| **Fundraisers** | Donations, product sales and events with goals, progress, per-dancer totals, orders with delivery tracking; family purchases are invoiced or paid online (test mode) |
| **Ticketing** | Ticket types (general, reserved, VIP, student, complimentary, staff), quantities, sales windows, seating chart with seat selection, online purchases (test mode), box office sales, refunds that release seats, will-call list |
| **Communications** | Emails, text alerts (320-character limit, SMS consent respected) and newsletters built from sections (headings, text, images, buttons, announcements, auto-filled events and dates). Recipients by class, team, family, dancer, event, recital, performance or staff; templates; scheduling in Eastern time; delivery report per recipient. Everyone has an **Inbox** in their portal with unread counts |
| **Notifications & Reminders** | Automatic reminders (tuition due, overdue invoices, missing signatures, events, registration deadlines, recitals, costume returns, call times, rehearsals, missing costumes, repairs) with per-type on/off, days before and channels; each sent only once. Manual notifications, scheduled for a later date if needed |
| **Media Library** | Upload photos, music, videos, flyers and documents (drag and drop); categories, visibility, descriptions, links to classes/costumes/recitals/families/etc.; previews and downloads. Used by newsletters, class videos, recital music, policies and the website |
| **Class Videos & Notes** | Teachers upload videos or private YouTube/Vimeo links for their classes (combination, choreography, practice…), choose who can watch, and keep class notes (optionally shared with families). Parents see only their dancers' classes |
| **Schedule Requests** | Teachers ask to cancel, move or cover a class or take time off; the office approves (cancellations update the calendar and notify families) or declines with a reason |
| **Website** | Pages from templates (Home, About, Classes, Faculty, Registration, Schedule, Events, Recitals, Teams, Contact, Portal login) built from sections, with drag-and-drop ordering, colours, alignment, spacing, background photos, galleries and video; site fonts, colours, tagline and logo; desktop/tablet/mobile preview; autosaved drafts, preview, publish, unpublish and discard. The public site (`#/site`) pulls classes, schedule, faculty, events and recitals live — never private data |
| **Analytics** | Enrollment by class, age, level and style, class capacity, retention vs. the previous year, attendance by month and class, teacher hours and load, revenue, fundraising, costume availability and usage, event participation and tickets; filter by school year; every chart has a table view and CSV download |
| **Settings** | Tabs for studio information & logo, billing rules (tuition due day, tax, sibling discount, late fee & grace period, registration fee, payment methods, refund policy, invoice categories), programs & options (dance styles, age groups, accessory types, quick-change threshold), and reminders. Renaming an option updates every record that uses it |

## Planning: fittings, picture day, volunteers & checklists

| Section | What you can do |
| --- | --- |
| **Costume Fittings** | Fitting days with hours, location, fitters and volunteer helpers, linked to a recital. Link dancers to time slots a few at a time, a whole class or team at once (the roster stays current), or let **Auto-schedule** do it (dancers per slot, minutes each, siblings kept together, "everyone in the recital without a time"). Each dancer shows her size and the costumes to try on; record Fitted / Needs alteration / Refit / No-show with a note, and open an **alteration job** on Repair & Cleaning in one click. Warnings for double-booked dancers, siblings far apart, recital dancers without a time and schedules that run late. Move dancers between times, duplicate a day, print the schedule with check-off boxes |
| **Picture Day** | The same scheduler for photos: one group time per class or team, then open individual & sibling times. Photographer, instructions (costume, hair & makeup), Photographed / Retake / No-show tracking and printable schedule |
| **Families** | **Send times to families** publishes the day and sends each family a notice with their dancers' times. In the Parent Portal, **Fittings & Picture Day** lists their times and instructions, and families can book, change or cancel open spots when booking is on |
| **Volunteer Sign-ups** | Sign-up forms with a list of jobs (date, time, people needed, skill, description), a deadline and one-click "common recital jobs". Families sign up in the Parent Portal (**Volunteer**) or anyone can use the public link (`#/volunteer/<id>`). Sign-ups are matched to existing volunteers by email, or create a new volunteer record. Staff add people (best matches by availability and skill first), set Confirmed / Checked in / No-show, move people between jobs, email everyone signed up, and print a sign-up sheet with blank lines for open spots. Each volunteer's profile lists their sign-ups |
| **Checklists & To-Dos** | Checklists you reuse (reset, duplicate) and to-do lists with due dates, owners (staff or volunteers), priority and notes. Type or paste several lines to add many items at once; reorder, filter, clear completed, archive and print. **Due soon** and **Assigned to me** views; lists can be office-only or shared with teachers and performance staff |

## Not connected yet (by design)

- **Logins** are a "Viewing as" preview, not secure sign-in.
- **Online payments** run in test mode: no card is charged and no card numbers are collected or stored. Office-recorded cash/check/bank payments are real records.
- **Email and SMS** aren't sent: messages and reminders are delivered to portal inboxes, and every delivery is marked "provider not connected".
- **Files** (media, videos) are stored in this browser's IndexedDB. Files up to 8 MB are included in the backup; larger videos stay on this device.

## Data storage

- **Dates and times:** dates are shown as MM/DD/YYYY (e.g. 12/15/1984). Times are New York Eastern time whatever the device's time zone: timestamps are converted and labelled EST/EDT, and "today" is the New York date. Class and event times are entered as studio (Eastern) wall-clock times. See `src/data/time.ts`.

- All data is stored as **relational tables** linked by unique IDs: accounts, families, guardians, emergency contacts, staff, school years, classrooms, classes, enrollments, calendar entries, per-date class changes, attendance, time entries (with audit history), notices, announcements, an activity log, dancers, categories, costumes and props, accessories / parts, notes, storage locations, shows, performance plans, cast lists, cast memberships, costume and prop assignments, volunteers, fitting & picture-day schedules and time slots, volunteer sign-up forms and sign-ups, and checklists / to-do items. Costumes and props share one inventory table, marked by `kind`. See `src/data/types.ts`.
- Every change is **saved automatically** in the browser (localStorage). Data survives refreshes and closing the browser, and stays in sync across open tabs.
- Deleting a record never leaves broken links. Related assignments are cleaned up, and costumes from a deleted category or location are reassigned (or left unassigned) and the change is logged.
- Photos are resized automatically and stored in the browser's IndexedDB (much larger than localStorage); their details are in the `photos` table. Backups include photos.
- Data lives **on the device and browser where it was entered**. Use **Settings → Download full backup** regularly. Use **Restore from backup** to move the data to another computer.

## Sample data

On first launch the app loads sample families, staff, classes, a recital with a running order, invoices and payments, teams, events, policies, fundraisers, a ticketed show, messages, a fitting day, a picture day, a volunteer sign-up form, checklists and a to-do list, plus 8 dancers, 12 costumes, 6 props, 4 volunteers, 3 categories, 3 storage locations, 2 shows with cast lists, and a performance plan with costume assignments. Every sample record has a **Sample** tag. **Settings → Remove sample data** deletes it all and keeps anything you entered yourself.

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
