Unsupported today: Bower has no web lookup, so this case is not run; it records the requirement. The runner gives the model no web tool, and a lookup request with no answer waits.
When lookups exist, the lifecycle is: web lookups are on, Alex asks for the Saltmere bus timetable, Bower makes one recorded lookup, the lookup stand-in fails (the page does not load), and a replay adds nothing.
Permission: web lookups are on (allowWeb: true); the request's words grant nothing more.
Lookup failure: the answer says plainly that Bower could not look it up and why, writes no note and invents no timetable. It is told apart from web lookups being off and from a page that loads but has expired.
Preserved prior results: every note stays byte identical.
A scripted answer alone scores this case clean today, so a score proves nothing until the failure is injected and the lookup is recorded.
