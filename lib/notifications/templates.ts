// Inline HTML email templates. Kept minimal to avoid pulling in react-email.
// Every template returns { subject, html, text }.

export type RenderedEmail = { subject: string; html: string; text: string };

type WrapOpts = { title: string; preheader?: string; cta?: { href: string; label: string } };

function wrap(body: string, opts: WrapOpts) {
  return `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${opts.title}</title>
</head>
<body style="margin:0;background:#0f0f12;color:#eaeaea;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  ${opts.preheader ? `<span style="display:none;opacity:0;color:transparent;">${opts.preheader}</span>` : ""}
  <div style="max-width:560px;margin:24px auto;padding:24px;background:#17171c;border-radius:16px;border:1px solid rgba(255,255,255,0.08);">
    <div style="font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:#9aa0a6;margin-bottom:8px;">The 2026 Ultimate Sports Decathlon</div>
    <h1 style="font-size:20px;margin:0 0 16px 0;color:#fff;">${opts.title}</h1>
    ${body}
    ${opts.cta
      ? `<p style="margin:24px 0 0 0;"><a href="${opts.cta.href}" style="display:inline-block;background:#635bff;color:#fff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600;font-size:14px;">${opts.cta.label}</a></p>`
      : ""}
    <p style="margin:24px 0 0 0;font-size:11px;color:#9aa0a6;">You're receiving this because notifications are on. Manage your preferences at /preferences.</p>
  </div>
</body>
</html>`;
}

export function renderDraftOpens(event: { name: string; slug: string }, baseUrl: string): RenderedEmail {
  const subject = `Draft open — ${event.name}`;
  const html = wrap(
    `<p style="color:#eaeaea;font-size:14px;line-height:1.5;">The ${event.name} draft just opened. Hop into the draft room to set up your roster and auto-draft.</p>`,
    {
      title: "Draft is open",
      preheader: subject,
      cta: { href: `${baseUrl}/draft`, label: "Open draft room" },
    },
  );
  const text = `${event.name} draft just opened. Visit ${baseUrl}/draft`;
  return { subject, html, text };
}

export function renderDraftTurn(event: { name: string }, baseUrl: string): RenderedEmail {
  const subject = `You're on the clock — ${event.name}`;
  const html = wrap(
    `<p style="color:#eaeaea;font-size:14px;line-height:1.5;">It's your pick in the ${event.name} draft. Head to the draft room to lock one in.</p>`,
    {
      title: "You're on the clock",
      preheader: subject,
      cta: { href: `${baseUrl}/draft`, label: "Make your pick" },
    },
  );
  const text = `You're on the clock in the ${event.name} draft. ${baseUrl}/draft`;
  return { subject, html, text };
}

export function renderEventLock(event: { name: string; slug: string }, baseUrl: string): RenderedEmail {
  const subject = `Entry deadline reached — ${event.name}`;
  const html = wrap(
    `<p style="color:#eaeaea;font-size:14px;line-height:1.5;">Entries for ${event.name} are locked. Good luck.</p>`,
    {
      title: "Entries locked",
      cta: { href: `${baseUrl}/events/${event.slug}`, label: "View event" },
    },
  );
  return { subject, html, text: `${event.name} entries locked.` };
}

export function renderHotSeatDeclared(
  declarerName: string,
  declaration: string,
  odds: number,
  vetoDeadline: string | null,
  baseUrl: string,
): RenderedEmail {
  const subject = `Hot Seat: ${declarerName} declared — veto window open`;
  const oddsStr = odds > 0 ? `+${odds}` : `${odds}`;
  const html = wrap(
    `<p style="color:#eaeaea;font-size:14px;line-height:1.6;"><strong>${declarerName}</strong> took the Hot Seat:</p>
     <blockquote style="border-left:3px solid #635bff;padding-left:12px;color:#eaeaea;font-size:15px;margin:12px 0;">${declaration}</blockquote>
     <p style="color:#9aa0a6;font-size:12px;">Odds ${oddsStr}${vetoDeadline ? ` · veto window closes ${new Date(vetoDeadline).toLocaleString()}` : ""}</p>`,
    {
      title: "Hot Seat declared",
      cta: { href: `${baseUrl}/hot-seat`, label: "Review & vote" },
    },
  );
  return { subject, html, text: `${declarerName} Hot Seat: ${declaration}` };
}

export function renderEventFinal(
  event: { name: string; slug: string },
  podium: Array<{ display_name: string; awarded_points: number }>,
  baseUrl: string,
): RenderedEmail {
  const subject = `${event.name} is final — season points awarded`;
  const list = podium
    .map((row, i) => `<li style="margin:4px 0;">${i + 1}. ${row.display_name} — ${row.awarded_points.toFixed(1)} pts</li>`)
    .join("");
  const html = wrap(
    `<p style="color:#eaeaea;font-size:14px;line-height:1.5;">${event.name} just finalized. Here's where it landed:</p>
     <ol style="color:#eaeaea;font-size:14px;line-height:1.6;padding-left:20px;">${list}</ol>`,
    {
      title: `${event.name} — final`,
      cta: { href: `${baseUrl}/season/2026`, label: "View season standings" },
    },
  );
  return { subject, html, text: `${event.name} final. ${baseUrl}/season/2026` };
}

export function renderNflWeekResults(
  week: number,
  top: Array<{ display_name: string; total: number }>,
  baseUrl: string,
): RenderedEmail {
  const leader = top[0];
  const subject = leader
    ? `NFL Pick'em Week ${week}: ${leader.display_name} wins with ${leader.total} pts`
    : `NFL Pick'em Week ${week} is final`;
  const list = top
    .map((row, i) => `<li style="margin:4px 0;">${i + 1}. ${row.display_name} — ${row.total} pts</li>`)
    .join("");
  const html = wrap(
    `<p style="color:#eaeaea;font-size:14px;line-height:1.5;">Week ${week} is in the books. Top of the board:</p>
     <ol style="color:#eaeaea;font-size:14px;line-height:1.6;padding-left:20px;">${list}</ol>`,
    {
      title: `Pick'em Week ${week} — final`,
      preheader: subject,
      cta: { href: `${baseUrl}/pickem`, label: "See the full week" },
    },
  );
  return { subject, html, text: `${subject}. ${baseUrl}/pickem` };
}
