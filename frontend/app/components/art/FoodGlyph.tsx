"use client";

import React from "react";

export type GlyphKind =
  | "idli"
  | "dosa"
  | "roti"
  | "rice"
  | "dal"
  | "chai"
  | "egg"
  | "paneer"
  | "leaf"
  | "grain"
  | "wheat"
  | "olive"
  | "citrus"
  | "tomato"
  | "banana"
  | "plate"
  | "bowl"
  | "jar"
  | "flame"
  | "footprint"
  | "sprout";

export function resolveGlyph(foodName: string = "", mealType: string = ""): GlyphKind {
  const s = foodName.toLowerCase().trim();
  const m = mealType.toLowerCase().trim();

  // Keyword matches (specific Indian & everyday foods first)
  if (s.includes("idli") || s.includes("idly")) return "idli";
  if (s.includes("dosa") || s.includes("cheela") || s.includes("chilla") || s.includes("uttapam")) return "dosa";
  if (s.includes("roti") || s.includes("chapati") || s.includes("paratha") || s.includes("phulka") || s.includes("naan") || s.includes("kulcha") || s.includes("puri") || s.includes("poori")) return "roti";
  if (s.includes("rice") || s.includes("biryani") || s.includes("pulao") || s.includes("khichdi") || s.includes("chawal")) return "rice";
  if (s.includes("dal") || s.includes("daal") || s.includes("sambar") || s.includes("rasam") || s.includes("kadhi") || s.includes("curry") || s.includes("chole") || s.includes("rajma")) return "dal";
  if (s.includes("chai") || s.includes("tea") || s.includes("coffee") || s.includes("milk") || s.includes("latte") || s.includes("lassi") || s.includes("buttermilk") || s.includes("chaas")) return "chai";
  if (s.includes("egg") || s.includes("omelet") || s.includes("bhurji") || s.includes("boiled egg")) return "egg";
  if (s.includes("paneer") || s.includes("tofu") || s.includes("chicken") || s.includes("fish") || s.includes("mutton") || s.includes("soya") || s.includes("soy")) return "paneer";
  if (s.includes("banana") || s.includes("kela")) return "banana";
  if (s.includes("orange") || s.includes("lemon") || s.includes("lime") || s.includes("apple") || s.includes("citrus") || s.includes("papaya") || s.includes("mango")) return "citrus";
  if (s.includes("tomato") || s.includes("tamatar") || s.includes("sauce") || s.includes("chutney")) return "tomato";
  if (s.includes("salad") || s.includes("palak") || s.includes("methi") || s.includes("spinach") || s.includes("leaf") || s.includes("greens") || s.includes("sabzi") || s.includes("subzi")) return "leaf";
  if (s.includes("oats") || s.includes("cereal") || s.includes("almond") || s.includes("nut") || s.includes("peanut") || s.includes("walnut") || s.includes("cashew") || s.includes("seed") || s.includes("flax")) return "grain";
  if (s.includes("bread") || s.includes("toast") || s.includes("wheat") || s.includes("atta") || s.includes("poha") || s.includes("upma")) return "wheat";
  if (s.includes("oil") || s.includes("ghee") || s.includes("butter") || s.includes("olive")) return "olive";

  // Meal type fallbacks
  if (m === "breakfast") return "bowl";
  if (m === "lunch" || m === "dinner") return "plate";
  if (m === "snack") return "chai";

  return "plate";
}

interface FoodGlyphProps {
  glyph?: GlyphKind;
  name?: string;
  mealType?: string;
  size?: number;
  className?: string;
}

export function FoodGlyph({
  glyph,
  name,
  mealType,
  size = 28,
  className = "",
}: FoodGlyphProps) {
  const kind = glyph || resolveGlyph(name, mealType);

  const style = { width: size, height: size, display: "inline-block", verticalAlign: "middle" };

  switch (kind) {
    case "idli":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-idli ${className}`} role="img" aria-label="Idli">
          {/* Banana leaf backdrop */}
          <path d="M4 22C8 20 24 20 28 22" stroke="#527563" strokeWidth="2" strokeLinecap="round" />
          {/* Two steamed idlis */}
          <ellipse cx="12" cy="15" rx="7" ry="5.5" fill="#fcfaf5" stroke="#cfc7b8" strokeWidth="1.5" />
          <ellipse cx="20" cy="13" rx="7" ry="5.5" fill="#ffffff" stroke="#b4aea1" strokeWidth="1.5" />
          {/* Steaming cues */}
          <path d="M12 7Q11 5 13 4" stroke="#d5e4d9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M19 6Q18 4 20 3" stroke="#d5e4d9" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </svg>
      );

    case "dosa":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-dosa ${className}`} role="img" aria-label="Dosa">
          {/* Golden rolled crepe */}
          <path d="M5 21L24 10C26 8.5 28 9.5 27 12L10 23C8.5 24.5 4 23 5 21Z" fill="#e5b869" stroke="#b8832a" strokeWidth="1.5" />
          <path d="M8 20L25 10" stroke="#f6dc9c" strokeWidth="1.5" strokeLinecap="round" />
          {/* Small chutney katori */}
          <circle cx="23" cy="22" r="4.5" fill="#ffffff" stroke="#3e5d4e" strokeWidth="1.2" />
          <circle cx="23" cy="22" r="2.5" fill="#eaf1ed" />
        </svg>
      );

    case "roti":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-roti ${className}`} role="img" aria-label="Roti">
          <circle cx="16" cy="16" r="11" fill="#edd9b0" stroke="#b88c4b" strokeWidth="1.5" />
          {/* Brown toasted spots */}
          <circle cx="13" cy="13" r="1.5" fill="#8f652b" opacity="0.6" />
          <circle cx="19" cy="14" r="1.8" fill="#8f652b" opacity="0.6" />
          <circle cx="14" cy="18" r="1.2" fill="#8f652b" opacity="0.5" />
          <circle cx="18" cy="19" r="1.5" fill="#8f652b" opacity="0.7" />
          {/* Warm puffed crescent */}
          <path d="M9 13C11 10 17 9 21 11" stroke="#fff" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
        </svg>
      );

    case "rice":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-rice ${className}`} role="img" aria-label="Rice">
          {/* Ceramic bowl */}
          <path d="M6 16C6 23 11 26 16 26C21 26 26 23 26 16H6Z" fill="#f4efe6" stroke="#545147" strokeWidth="1.5" />
          <path d="M12 26H20" stroke="#545147" strokeWidth="2" strokeLinecap="round" />
          {/* Fluffy mounded grains */}
          <path d="M6 16C8 10 14 9 16 9C18 9 24 10 26 16" fill="#ffffff" stroke="#cfc7b8" strokeWidth="1.5" />
          <ellipse cx="14" cy="12" rx="1.5" ry="0.8" fill="#e5dfd3" />
          <ellipse cx="18" cy="13" rx="1.5" ry="0.8" fill="#e5dfd3" />
          <ellipse cx="16" cy="15" rx="1.5" ry="0.8" fill="#e5dfd3" />
        </svg>
      );

    case "dal":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-dal ${className}`} role="img" aria-label="Dal">
          {/* Brass bowl */}
          <path d="M6 15C6 22 10 25 16 25C22 25 26 22 26 15H6Z" fill="#d49b35" stroke="#8c6314" strokeWidth="1.5" />
          {/* Lentil broth top */}
          <ellipse cx="16" cy="15" rx="10" ry="3.5" fill="#f1bf4d" stroke="#8c6314" strokeWidth="1.2" />
          {/* Tadka / cumin seeds / coriander leaf */}
          <circle cx="14" cy="15" r="0.8" fill="#5c3f0a" />
          <circle cx="17" cy="16" r="0.8" fill="#5c3f0a" />
          <path d="M18 14C19 13 20 14 19.5 15" stroke="#3e5d4e" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );

    case "chai":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-chai ${className}`} role="img" aria-label="Chai">
          {/* Terracotta kulhad cup */}
          <path d="M9 12L11 26H21L23 12H9Z" fill="#c86d51" stroke="#873c24" strokeWidth="1.5" />
          <ellipse cx="16" cy="12" rx="7" ry="2" fill="#e19777" />
          {/* Rims and ribbed bands */}
          <line x1="10" y1="17" x2="22" y2="17" stroke="#873c24" strokeWidth="1" />
          {/* Whisp of aromatic steam */}
          <path d="M14 8Q13 5 15 3" stroke="#b4aea1" strokeWidth="1.2" strokeLinecap="round" fill="none" />
          <path d="M18 7Q17 5 19 3" stroke="#b4aea1" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </svg>
      );

    case "egg":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-egg ${className}`} role="img" aria-label="Egg">
          {/* Egg white base */}
          <path d="M16 6C11 6 8 13 8 20C8 25 11.5 27 16 27C20.5 27 24 25 24 20C24 13 21 6 16 6Z" fill="#ffffff" stroke="#cfc7b8" strokeWidth="1.5" />
          {/* Vibrant yolk */}
          <circle cx="16" cy="19" r="4.5" fill="#f4b236" stroke="#c48316" strokeWidth="1.2" />
          <circle cx="15" cy="18" r="1.2" fill="#fff" opacity="0.8" />
        </svg>
      );

    case "paneer":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-paneer ${className}`} role="img" aria-label="Paneer">
          {/* Cubes of fresh malai paneer */}
          <path d="M8 14L16 9L23 13L15 18L8 14Z" fill="#ffffff" stroke="#cfc7b8" strokeWidth="1.3" />
          <path d="M8 14V21L15 25V18L8 14Z" fill="#f4efe6" stroke="#b4aea1" strokeWidth="1.3" />
          <path d="M23 13V20L15 25V18L23 13Z" fill="#e8e1d3" stroke="#b4aea1" strokeWidth="1.3" />
        </svg>
      );

    case "leaf":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-leaf ${className}`} role="img" aria-label="Fibre Leaf">
          <path d="M8 24C8 24 9 12 21 8C21 8 23 20 11 24C9.5 24.5 8 24 8 24Z" fill="#606c38" stroke="#3f4722" strokeWidth="1.5" />
          <path d="M10 22C14 18 17 14 20 9" stroke="#92a356" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M14 18L17 19" stroke="#92a356" strokeWidth="1" strokeLinecap="round" />
        </svg>
      );

    case "grain":
    case "wheat":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-wheat ${className}`} role="img" aria-label="Grain">
          <path d="M16 26V8" stroke="#8c6314" strokeWidth="1.5" strokeLinecap="round" />
          {/* Wheat grains */}
          <ellipse cx="14" cy="12" rx="2.5" ry="1.5" fill="#e5b869" stroke="#8c6314" strokeWidth="1" transform="rotate(-30 14 12)" />
          <ellipse cx="18" cy="11" rx="2.5" ry="1.5" fill="#e5b869" stroke="#8c6314" strokeWidth="1" transform="rotate(30 18 11)" />
          <ellipse cx="14" cy="16" rx="2.5" ry="1.5" fill="#e5b869" stroke="#8c6314" strokeWidth="1" transform="rotate(-30 14 16)" />
          <ellipse cx="18" cy="15" rx="2.5" ry="1.5" fill="#e5b869" stroke="#8c6314" strokeWidth="1" transform="rotate(30 18 15)" />
          <ellipse cx="16" cy="7" rx="2" ry="1.5" fill="#e5b869" stroke="#8c6314" strokeWidth="1" />
        </svg>
      );

    case "olive":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-olive ${className}`} role="img" aria-label="Healthy Fat">
          {/* Droplet / olive */}
          <path d="M16 5C16 5 9 15 9 20C9 24 12 27 16 27C20 27 23 24 23 20C23 15 16 5 16 5Z" fill="#a4b370" stroke="#606c38" strokeWidth="1.5" />
          {/* Specular highlight */}
          <path d="M13 18C13 16 14.5 14 16 12" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );

    case "citrus":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-citrus ${className}`} role="img" aria-label="Fruit">
          <circle cx="16" cy="16" r="10" fill="#f7ab3b" stroke="#ba7109" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="7.5" fill="#ffe2b0" />
          {/* Citrus segments */}
          <path d="M16 9.5V16M16 16L21 12M16 16L21 19M16 16L16 22.5M16 16L11 19M16 16L11 12" stroke="#ba7109" strokeWidth="1" />
        </svg>
      );

    case "tomato":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-tomato ${className}`} role="img" aria-label="Tomato">
          <circle cx="16" cy="17" r="9" fill="#c84b31" stroke="#872915" strokeWidth="1.5" />
          {/* Green stem calyx */}
          <path d="M16 8V5M16 8L13 7M16 8L19 7M16 8L14 10M16 8L18 10" stroke="#3e5d4e" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case "banana":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-banana ${className}`} role="img" aria-label="Banana">
          <path d="M7 10C10 18 18 24 26 21C22 25 12 25 6 15C5.5 14 6 11 7 10Z" fill="#f4d04d" stroke="#b08b17" strokeWidth="1.5" />
          <path d="M26 21L27 19" stroke="#606c38" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case "flame":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-flame ${className}`} role="img" aria-label="Calories">
          <path d="M16 4C16 4 19 8 19 12C19 14 18 15 17 16C18 16 22 17 22 21C22 25 19 28 16 28C13 28 10 25 10 21C10 17 14 13 14 10C14 8 16 4 16 4Z" fill="#d96b52" stroke="#b84e37" strokeWidth="1.5" />
          <path d="M16 19C16 19 18 21 18 23C18 24.5 17 25.5 16 25.5C15 25.5 14 24.5 14 23C14 21 16 19 16 19Z" fill="#f4cf65" />
        </svg>
      );

    case "footprint":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-footprint ${className}`} role="img" aria-label="Steps">
          <ellipse cx="14" cy="20" rx="3.5" ry="5.5" fill="#3e5d4e" transform="rotate(-10 14 20)" />
          <ellipse cx="12" cy="11" rx="1.2" ry="1.8" fill="#3e5d4e" />
          <ellipse cx="14.5" cy="11.5" rx="1" ry="1.5" fill="#3e5d4e" />
          <ellipse cx="16.5" cy="12.5" rx="0.9" ry="1.3" fill="#3e5d4e" />
          <ellipse cx="18" cy="14" rx="0.8" ry="1.1" fill="#3e5d4e" />
        </svg>
      );

    case "sprout":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-sprout ${className}`} role="img" aria-label="Streak Sprout">
          <path d="M16 26V15" stroke="#3e5d4e" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M16 16C12 14 11 9 16 8C17 12 17 14 16 16Z" fill="#689377" stroke="#2b4639" strokeWidth="1.2" />
          <path d="M16 19C20 17 21 12 16 12C15 15 15 18 16 19Z" fill="#8cb59a" stroke="#2b4639" strokeWidth="1.2" />
          <path d="M12 26H20" stroke="#b4aea1" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );

    case "bowl":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-bowl ${className}`} role="img" aria-label="Bowl">
          <path d="M7 16C7 22.5 11 25.5 16 25.5C21 25.5 25 22.5 25 16H7Z" fill="#ffffff" stroke="#1c1b18" strokeWidth="1.5" />
          <line x1="12" y1="25.5" x2="20" y2="25.5" stroke="#1c1b18" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="16" cy="16" rx="9" ry="2.5" fill="#f3eee4" stroke="#1c1b18" strokeWidth="1.2" />
        </svg>
      );

    case "jar":
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-jar ${className}`} role="img" aria-label="Jar">
          {/* Glass carboy / jar */}
          <rect x="12" y="7" width="8" height="3" rx="1" fill="#f3eee4" stroke="#1c1b18" strokeWidth="1.2" />
          <path d="M10 11C8 13 8 26 9 27H23C24 26 24 13 22 11H10Z" fill="#ffffff" stroke="#1c1b18" strokeWidth="1.5" />
          <rect x="12" y="16" width="8" height="6" rx="1" fill="#fbf9f4" stroke="#cfc7b8" strokeWidth="1" />
        </svg>
      );

    case "plate":
    default:
      return (
        <svg viewBox="0 0 32 32" style={style} className={`food-glyph glyph-plate ${className}`} role="img" aria-label="Plate">
          <circle cx="16" cy="16" r="11" fill="#ffffff" stroke="#1c1b18" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="8" fill="#fcfaf5" stroke="#cfc7b8" strokeWidth="1" />
          <circle cx="16" cy="16" r="6" fill="#f4efe6" opacity="0.6" />
        </svg>
      );
  }
}
