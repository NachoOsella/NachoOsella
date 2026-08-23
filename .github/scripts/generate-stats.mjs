import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const USER = "NachoOsella";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
const OUT = "dist/stats.svg";
const FONT_DIR = new URL("../assets/", import.meta.url);

const C = {
  bg: "#1d2021",
  border: "#3c3836",
  yellow: "#fabd2f",
  green: "#a9b665",
  muted: "#a89984",
  foreground: "#d4be98",
};

// Embed the font so the card keeps its typography outside the local environment.
const FONTS = {
  regular: readFileSync(new URL("JetBrainsMono-Regular.ttf", FONT_DIR)).toString("base64"),
  bold: readFileSync(new URL("JetBrainsMono-Bold.ttf", FONT_DIR)).toString("base64"),
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
  <style>
    @font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:400;src:url(data:font/ttf;base64,${FONTS.regular}) format("truetype")}
    @font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:700;src:url(data:font/ttf;base64,${FONTS.bold}) format("truetype")}
    .mono{font-family:"JetBrains Mono",monospace}
  </style>
  <rect x="0.5" y="0.5" width="199" height="194" fill="${C.bg}" stroke="${C.border}"/>
  <rect width="200" height="3" fill="${C.green}"/>
  <text x="16" y="28" class="mono" font-size="10" letter-spacing="0.15em" fill="${C.green}">CONTRIBUTIONS</text>
  <text x="16" y="82" class="mono" font-size="46" font-weight="700" letter-spacing="-0.06em" fill="${C.yellow}">${totalStr}</text>
  <line x1="16" y1="101" x2="184" y2="101" stroke="${C.border}"/>
  <text x="16" y="123" class="mono" font-size="9" letter-spacing="0.08em" fill="${C.muted}">LAST YEAR</text>
  <text x="184" y="124" text-anchor="end" class="mono" font-size="16" font-weight="700" fill="${C.foreground}">${fmt(recent)}</text>
  <line x1="16" y1="140" x2="184" y2="140" stroke="${C.border}"/>
  <line x1="72" y1="153" x2="72" y2="181" stroke="${C.border}"/>
  <line x1="132" y1="153" x2="132" y2="181" stroke="${C.border}"/>
  <text x="16" y="158" class="mono" font-size="8.5" letter-spacing="0.08em" fill="${C.muted}">REPOS</text>
  <text x="16" y="180" class="mono" font-size="16" font-weight="700" fill="${C.foreground}">${repos}</text>
  <text x="84" y="158" class="mono" font-size="8.5" letter-spacing="0.08em" fill="${C.muted}">ACTIVE</text>
  <text x="84" y="180" class="mono" font-size="14" font-weight="700" fill="${C.foreground}">${yearsActive} YRS</text>
  <text x="144" y="158" class="mono" font-size="8.5" letter-spacing="0.08em" fill="${C.muted}">SINCE</text>
  <text x="144" y="180" class="mono" font-size="13" font-weight="700" fill="${C.foreground}">${sinceYear}</text>
</svg>`;
}

const data = await getData();
mkdirSync("dist", { recursive: true });
writeFileSync(OUT, buildSvg(data), "utf8");
console.log(`stats: ${JSON.stringify(data)} -> ${OUT}`);
