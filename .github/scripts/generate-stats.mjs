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

function buildSvg({ lifetime }) {
  const totalStr = fmt(lifetime);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="195" viewBox="0 0 200 195" role="img" aria-label="${totalStr} contributions">
  <style>
    @font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:400;src:url(data:font/ttf;base64,${FONTS.regular}) format("truetype")}
    @font-face{font-family:"JetBrains Mono";font-style:normal;font-weight:700;src:url(data:font/ttf;base64,${FONTS.bold}) format("truetype")}
    .mono{font-family:"JetBrains Mono",monospace}
  </style>
  <rect x="0.5" y="0.5" width="199" height="194" fill="${C.bg}" stroke="${C.border}"/>
  <rect width="200" height="3" fill="${C.green}"/>
  <text x="100" y="78" text-anchor="middle" class="mono" font-size="10" font-weight="400" letter-spacing="0.16em" fill="${C.green}">CONTRIBUTIONS</text>
  <text x="100" y="132" text-anchor="middle" class="mono" font-size="44" font-weight="700" letter-spacing="-0.06em" fill="${C.yellow}">${totalStr}</text>
</svg>`;
}

const data = await getData();
mkdirSync("dist", { recursive: true });
writeFileSync(OUT, buildSvg(data), "utf8");
console.log(`stats: ${JSON.stringify(data)} -> ${OUT}`);
