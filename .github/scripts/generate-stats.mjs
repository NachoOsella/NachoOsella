import { mkdirSync, writeFileSync } from "node:fs";

const USER = "NachoOsella";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const OUT = "dist/stats.svg";

const C = {
  bg: "#282828",
  border: "#3c3836",
  yellow: "#fabd2f",
  green: "#a9b665",
  aqua: "#8ec07c",
  grey: "#a89984",
  light: "#ebdbb2",
  muted: "#665c54",
};

async function gql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      "User-Agent": "generate-stats",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 600));
  return j.data;
}

function fmt(n) { return n.toLocaleString("en-US"); }

async function getData() {
  const base = await gql(`
    query($login: String!) {
      user(login: $login) {
        createdAt
        repositories(ownerAffiliations: [OWNER]) { totalCount }
        followers { totalCount }
        cc: contributionsCollection { contributionCalendar { totalContributions } contributionYears }
      }
    }`, { login: USER });

  const years = base.user.cc.contributionYears || [];
  const recent = base.user.cc.contributionCalendar.totalContributions;
  const repos = base.user.repositories.totalCount;
  const createdAt = base.user.createdAt;

  let lifetime = 0;
  if (years.length) {
    const parts = years.map((y, i) => `y${i}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`).join("\n");
    const data = await gql(`query($login: String!) { user(login: $login) { ${parts} } }`, { login: USER });
    lifetime = Object.values(data.user).reduce((a, v) => a + (v?.contributionCalendar?.totalContributions ?? 0), 0);
  }
  if (!lifetime) lifetime = recent;

  return { lifetime, recent, repos, yearsActive: years.length || 1, sinceYear: new Date(createdAt).getFullYear(), followers: base.user.followers.totalCount };
}

function buildSvg({ lifetime, recent, repos, yearsActive, sinceYear }) {
  const totalStr = fmt(lifetime);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="195" viewBox="0 0 200 195" role="img" aria-label="${totalStr} contributions">
  <style>.mono{font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace}.sans{font-family:'Segoe UI',Ubuntu,Inter,sans-serif}</style>
  <rect x="0.5" y="0.5" width="199" height="194" rx="9" fill="${C.bg}" stroke="${C.border}"/>
  <rect x="0.5" y="0.5" width="199" height="194" rx="9" fill="none" stroke="white" stroke-opacity="0.04"/>
  <g opacity="0.95">
    <circle cx="18" cy="14" r="4.2" fill="${C.border}"/>
    <circle cx="30" cy="14" r="4.2" fill="${C.muted}"/>
    <circle cx="42" cy="14" r="4.2" fill="#d8a657"/>
    <circle cx="54" cy="14" r="4.2" fill="${C.green}"/>
  </g>
  <text x="170" y="17.5" text-anchor="end" class="sans" font-size="8.5" font-weight="600" letter-spacing="0.08em" fill="${C.grey}" opacity="0.9">LIFETIME</text>
  <g text-anchor="middle">
    <text x="100" y="88" class="mono" font-size="38" font-weight="800" fill="${C.yellow}" letter-spacing="-0.02em">${totalStr}</text>
    <text x="100" y="108" class="sans" font-size="11" font-weight="700" letter-spacing="0.14em" fill="${C.aqua}">CONTRIBUTIONS</text>
    <text x="100" y="125" class="sans" font-size="9.5" fill="${C.grey}">last year · ${fmt(recent)}</text>
  </g>
  <line x1="16" y1="140" x2="184" y2="140" stroke="${C.border}" stroke-width="1"/>
  <g text-anchor="middle" class="sans">
    <text x="100" y="158" font-size="9.5" fill="${C.light}"><tspan font-weight="700">${repos}</tspan><tspan fill="${C.grey}"> repos</tspan><tspan fill="${C.muted}">  ·  </tspan><tspan font-weight="700">${yearsActive}</tspan><tspan fill="${C.grey}"> yrs</tspan><tspan fill="${C.muted}">  ·  </tspan><tspan fill="${C.grey}">since </tspan><tspan font-weight="700">${sinceYear}</tspan></text>
    <text x="100" y="174" font-size="7.5" letter-spacing="0.1em" fill="${C.muted}">GITHUB PROFILE · AUTO-UPDATED DAILY</text>
  </g>
</svg>`;
}

const data = await getData();
mkdirSync("dist", { recursive: true });
writeFileSync(OUT, buildSvg(data), "utf8");
console.log(`stats: ${JSON.stringify(data)} -> ${OUT}`);
