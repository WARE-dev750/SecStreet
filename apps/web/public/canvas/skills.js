// skills.js — skill vocabulary + transform file list into skill-grouped list.
window.CanvasParts = window.CanvasParts || {};
window.CanvasParts.Skills = (function () {
  const SKILL_RULES = [
    { skill: "PE Parsing",            keys: ["pe_", "pe-", "peheader", "pe-header", "pefile", "portable-executable", "coff", "dos_header", ".exe", ".dll"] },
    { skill: "ELF Parsing",           keys: ["elf_", "elf-", "elfheader", "elf-header", "readelf"] },
    { skill: "Mach-O Parsing",        keys: ["macho", "mach-o", "mach_o", "otool"] },
    { skill: "Disassembly",           keys: ["disasm", "objdump", "disassemble", "capstone", "mnemonic"] },
    { skill: "Hex / Binary Dump",     keys: ["hexdump", "xxd", "hex_", "binary", "binutils"] },
    { skill: "Strings / Extraction",  keys: ["strings-", "strings_", "extract"] },
    { skill: "Cryptography",          keys: ["crypto", "cipher", "aes", "rsa", "sha1", "sha256", "sha512", "md5", "hmac", "openssl", "x509", "certificate", "cert.pem"] },
    { skill: "Network",               keys: ["socket", "tcp", "udp", "dns", "tls", "ssl", "packet", "pcap", "capture", "net_", "network", "port"] },
    { skill: "Authentication",        keys: ["auth", "login", "logon", "credential", "passwd", "password", "session", "jwt", "token"] },
    { skill: "Log Parsing",           keys: ["syslog", "auditlog", "auth-log", "journal", "logparse", "parse-auth", "log-parser"] },
    { skill: "Detection & Rules",     keys: ["detect", "yara", "sigma", "ioc", "alert", "threat", "rule_", "/rules/", "indicator"] },
    { skill: "Process & System",      keys: ["process", "proc_", "uname", "kernel", "sysinfo", "ps_", "system"] },
    { skill: "Filesystem",            keys: ["filesystem", "fs_", "disk", "mount", "file_", "file-", "identify-file"] },
    { skill: "Hashing",               keys: ["hash", "digest", "sha256sum", "hash-file"] },
    { skill: "Workflow",              keys: ["workflow", "pipeline", "chain", "compose", "orchestrat", "steps"] },
    { skill: "Configuration",         keys: ["capability.json", "package.json", "tsconfig", "config", "wrangler", ".env", ".yaml", ".yml", ".toml", ".gitignore"] },
    { skill: "Documentation",         keys: ["readme", ".md", "/docs/", "/doc/"] },
    { skill: "Tests",                 keys: [".test.", ".spec.", "/tests/", "test_"] },
    { skill: "Build & Tooling",       keys: ["makefile", "cmake", "dockerfile", "deploy", "build.", "scripts/"] }
  ];

  function classifySkill(file) {
    if (file.dir) return null;
    const name = (file.name || "").toLowerCase();
    const pathLower = (file.path || "").toLowerCase();
    const contentLower = file.content ? file.content.slice(0, 4000).toLowerCase() : "";
    let best = null, bestScore = 0;
    for (const rule of SKILL_RULES) {
      let score = 0;
      for (const key of rule.keys) {
        if (name.includes(key)) score += 10;
        else if (pathLower.includes(key)) score += 5;
        if (contentLower && contentLower.includes(key)) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = rule.skill; }
    }
    return bestScore > 0 ? best : "Other";
  }

  function dominantCategory(files) {
    let red = 0, blue = 0, purple = 0;
    for (const f of files) {
      const hay = ((f.name || "") + " " + (f.path || "")).toLowerCase();
      if (/exploit|payload|c2|beacon|implant|shellcode|malware|backdoor|rootkit|red|offensive/.test(hay)) red++;
      else if (/detect|siem|soc|yara|sigma|alert|hunt|forensic|blue|defensive/.test(hay)) blue++;
      else purple++;
    }
    if (red > blue && red > purple) return "red";
    if (blue >= red && blue >= purple) return "blue";
    return "purple";
  }

  function transformToSkillView(files) {
    const buckets = new Map();
    for (const f of files) {
      if (f.dir) continue;
      const skill = classifySkill(f);
      if (!buckets.has(skill)) buckets.set(skill, []);
      buckets.get(skill).push(f);
    }
    const out = [];
    const names = [...buckets.keys()].sort((a, b) => {
      if (a === "Other") return 1;
      if (b === "Other") return -1;
      return a.localeCompare(b);
    });
    for (const skill of names) {
      const group = buckets.get(skill);
      const skillPath = "#skill:" + skill;
      out.push({
        path: skillPath, name: skill, dir: true, parent: "",
        category: "skill", catClass: dominantCategory(group),
        sub: group.length + " file" + (group.length === 1 ? "" : "s"),
        isSkill: true
      });
      for (const f of group) out.push({ ...f, parent: skillPath });
    }
    return out;
  }

  return { SKILL_RULES, classifySkill, dominantCategory, transformToSkillView };
})();
