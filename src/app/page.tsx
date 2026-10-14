"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type HistoryEntry = {
  expression: string;
  result: string;
};

type Key = {
  label: string;
  value: string;
  tone?: "utility" | "operator" | "equals";
  span?: boolean;
  ariaLabel?: string;
};

type Formula = {
  name: string;
  category: string;
  expression: string;
  example: string;
  description: string;
};

const HISTORY_STORAGE_KEY = "glow-calculator-history";
const THEME_STORAGE_KEY = "glow-calculator-theme";
const FONT_SIZE_STORAGE_KEY = "glow-calculator-font-size";
const FONT_SIZES = [88, 100, 112] as const;

const whatIfExamples = [
  { label: "Savings growth", expression: "1000*(1+0.05)^x" },
  { label: "Quadratic curve", expression: "x^2+3*x+2" },
  { label: "Distance traveled", expression: "60*x" },
];

const formulas: Formula[] = [
  {
    name: "Quadratic roots",
    category: "ALGEBRA",
    expression: "x = (−b ± √(b² − 4ac)) / 2a",
    example: "(-2+sqrt(2^2-4*1*(-3)))/(2*1)",
    description: "For ax² + bx + c = 0",
  },
  {
    name: "Right triangle",
    category: "GEOMETRY",
    expression: "c = √(a² + b²)",
    example: "sqrt(3^2+4^2)",
    description: "Find the hypotenuse",
  },
  {
    name: "Circle area",
    category: "GEOMETRY",
    expression: "A = πr²",
    example: "pi*5^2",
    description: "Area from a radius of 5",
  },
  {
    name: "Compound growth",
    category: "FINANCE",
    expression: "A = P(1 + r/n)ⁿᵗ",
    example: "1000*(1+0.05/12)^(12*10)",
    description: "$1,000 at 5%, compounded monthly",
  },
];

const keys: Key[] = [
  { label: "AC", value: "clear", tone: "utility" },
  { label: "±", value: "sign", tone: "utility", ariaLabel: "Toggle sign" },
  { label: "%", value: "%", tone: "utility", ariaLabel: "Percent" },
  { label: "÷", value: "/", tone: "operator", ariaLabel: "Divide" },
  { label: "7", value: "7" },
  { label: "8", value: "8" },
  { label: "9", value: "9" },
  { label: "×", value: "*", tone: "operator", ariaLabel: "Multiply" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
  { label: "6", value: "6" },
  { label: "−", value: "-", tone: "operator", ariaLabel: "Subtract" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "+", value: "+", tone: "operator", ariaLabel: "Add" },
  { label: "0", value: "0", span: true },
  { label: ".", value: "." },
  { label: "=", value: "=", tone: "equals", ariaLabel: "Calculate" },
];

const scientificKeys: Key[] = [
  { label: "sin", value: "sin(", ariaLabel: "Sine" },
  { label: "cos", value: "cos(", ariaLabel: "Cosine" },
  { label: "tan", value: "tan(", ariaLabel: "Tangent" },
  { label: "ln", value: "ln(", ariaLabel: "Natural logarithm" },
  { label: "log", value: "log(", ariaLabel: "Base 10 logarithm" },
  { label: "√", value: "sqrt(", ariaLabel: "Square root" },
  { label: "x²", value: "^2", ariaLabel: "Square" },
  { label: "xʸ", value: "^", ariaLabel: "Power" },
  { label: "1/x", value: "^(-1)", ariaLabel: "Reciprocal" },
  { label: "(", value: "(", ariaLabel: "Open parenthesis" },
  { label: ")", value: ")", ariaLabel: "Close parenthesis" },
  { label: "π", value: "pi", ariaLabel: "Pi constant" },
  { label: "e", value: "e", ariaLabel: "Euler's number" },
  { label: "n!", value: "!", ariaLabel: "Factorial" },
  { label: "abs", value: "abs(", ariaLabel: "Absolute value" },
];

function evaluateExpression(
  input: string,
  angleMode: "DEG" | "RAD",
  variableValue?: number,
): number {
  let position = 0;

  const parseExpression = (): number => {
    let value = parseTerm();

    while (input[position] === "+" || input[position] === "-") {
      const operator = input[position++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }

    return value;
  };

  const parseTerm = (): number => {
    let value = parseUnary();

    while (input[position] === "*" || input[position] === "/") {
      const operator = input[position++];
      const right = parseUnary();
      if (operator === "/" && right === 0) {
        throw new Error("Cannot divide by zero");
      }
      value = operator === "*" ? value * right : value / right;
    }

    return value;
  };

  const parseUnary = (): number => {
    if (input[position] === "+") {
      position++;
      return parseUnary();
    }
    if (input[position] === "-") {
      position++;
      return -parseUnary();
    }
    return parsePower();
  };

  const parsePower = (): number => {
    const value = parsePostfix();
    if (input[position] === "^") {
      position++;
      return value ** parseUnary();
    }
    return value;
  };

  const parsePostfix = (): number => {
    let value = parsePrimary();
    while (input[position] === "%" || input[position] === "!") {
      const operator = input[position++];
      if (operator === "%") {
        value /= 100;
      } else {
        if (!Number.isInteger(value) || value < 0 || value > 170) {
          throw new Error("Factorial requires an integer from 0 to 170");
        }
        let factorial = 1;
        for (let i = 2; i <= value; i++) factorial *= i;
        value = factorial;
      }
    }
    return value;
  };

  const parsePrimary = (): number => {
    if (input[position] === "(") {
      position++;
      const value = parseExpression();
      if (input[position] !== ")") {
        throw new Error("Unclosed parenthesis");
      }
      position++;
      return value;
    }

    const nameStart = position;
    while (/[a-z]/i.test(input[position] ?? "")) position++;
    if (position > nameStart) {
      const name = input.slice(nameStart, position).toLowerCase();
      if (name === "pi") return Math.PI;
      if (name === "e") return Math.E;
      if (name === "x") {
        if (variableValue === undefined) throw new Error("Set a value for x");
        return variableValue;
      }
      if (input[position] !== "(") throw new Error("Function requires parentheses");
      position++;
      const argument = parseExpression();
      if (input[position] !== ")") throw new Error("Unclosed function");
      position++;
      const radians = angleMode === "DEG" ? argument * Math.PI / 180 : argument;
      const result: Record<string, number> = {
        sin: Math.sin(radians),
        cos: Math.cos(radians),
        tan: Math.tan(radians),
        asin: Math.asin(argument),
        acos: Math.acos(argument),
        atan: Math.atan(argument),
        sqrt: Math.sqrt(argument),
        ln: Math.log(argument),
        log: Math.log10(argument),
        abs: Math.abs(argument),
        exp: Math.exp(argument),
      };
      const computed = result[name];
      if (computed === undefined) throw new Error("Unknown function");
      if (name === "asin" || name === "acos" || name === "atan") {
        return angleMode === "DEG" ? computed * 180 / Math.PI : computed;
      }
      return computed;
    }

    const start = position;
    while (/[0-9.]/.test(input[position] ?? "")) {
      position++;
    }

    const number = Number(input.slice(start, position));
    if (start === position || !Number.isFinite(number)) {
      throw new Error("Invalid number");
    }
    return number;
  };

  const result = parseExpression();
  if (position !== input.length || !Number.isFinite(result)) {
    throw new Error("Invalid expression");
  }
  return result;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "Error";
  const rounded = Number(value.toPrecision(11));
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 10,
    useGrouping: false,
  }).format(rounded);
}

function formatExpression(expression: string): string {
  return expression
    .replace(/sqrt\(/g, "√(")
    .replace(/pi/g, "π")
    .replace(/\*/g, " × ")
    .replace(/\//g, " ÷ ")
    .replace(/-/g, "−")
    .replace(/\^/g, "^");
}

function getPreview(expression: string, angleMode: "DEG" | "RAD"): string | null {
  if (!expression || !/[0-9)%!ei]$/i.test(expression)) return null;
  try {
    return formatNumber(evaluateExpression(expression, angleMode));
  } catch {
    return null;
  }
}

export default function Home() {
  const [expression, setExpression] = useState("");
  const [justEvaluated, setJustEvaluated] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [fontSize, setFontSize] = useState<number>(100);
  const [fontSizeLoaded, setFontSizeLoaded] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutRef = useRef<HTMLDivElement>(null);
  const aboutTriggerRef = useRef<HTMLButtonElement>(null);
  const [calculatorMode, setCalculatorMode] = useState<"standard" | "scientific">("standard");
  const [angleMode, setAngleMode] = useState<"DEG" | "RAD">("DEG");
  const [workspaceTab, setWorkspaceTab] = useState<"history" | "formulas" | "what-if">("history");
  const [whatIfExpression, setWhatIfExpression] = useState("1000*(1+0.05)^x");
  const [whatIfValue, setWhatIfValue] = useState(10);
  const workspacePanelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (saved) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(saved);
        } catch {
          return;
        }
        if (
          Array.isArray(parsed) &&
          parsed.every(
            (entry) =>
              entry &&
              typeof entry.expression === "string" &&
              typeof entry.result === "string",
          )
        ) {
          setHistory(parsed.slice(0, 5));
        }
      }
    } finally {
      setHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!historyLoaded) return;
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  }, [history, historyLoaded]);

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } finally {
      setThemeLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!themeLoaded) return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, themeLoaded]);

  useEffect(() => {
    const savedSize = Number(window.localStorage.getItem(FONT_SIZE_STORAGE_KEY));
    if (FONT_SIZES.some((size) => size === savedSize)) setFontSize(savedSize);
    setFontSizeLoaded(true);
  }, []);

  useEffect(() => {
    document.documentElement.style.fontSize = `${fontSize}%`;
    if (fontSizeLoaded) {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, String(fontSize));
    }
  }, [fontSize, fontSizeLoaded]);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !aboutRef.current?.contains(event.target)) {
        setAboutOpen(false);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  const preview = useMemo(() => getPreview(expression, angleMode), [expression, angleMode]);
  const whatIfResult = useMemo(() => {
    try {
      return evaluateExpression(whatIfExpression, angleMode, whatIfValue);
    } catch {
      return null;
    }
  }, [whatIfExpression, angleMode, whatIfValue]);
  const whatIfPlot = useMemo(() => {
    const samples = Array.from({ length: 41 }, (_, index) => {
      const x = index * 30 / 40;
      try {
        const y = evaluateExpression(whatIfExpression, angleMode, x);
        return Number.isFinite(y) ? { x, y } : null;
      } catch {
        return null;
      }
    });
    const validSamples = samples.filter((point): point is { x: number; y: number } => point !== null);
    if (validSamples.length < 2) return { points: "", currentX: 0, summary: "" };

    const minimum = Math.min(...validSamples.map(({ y }) => y));
    const maximum = Math.max(...validSamples.map(({ y }) => y));
    const span = maximum - minimum || 1;
    const points = validSamples
      .map(({ x, y }) => `${(x / 30) * 300},${88 - ((y - minimum) / span) * 76}`)
      .join(" ");
    const summary = `The result ranges from ${formatNumber(minimum)} to ${formatNumber(maximum)} as x moves from 0 to 30.`;
    return {
      points,
      currentX: (whatIfValue / 30) * 300,
      summary,
    };
  }, [whatIfExpression, angleMode, whatIfValue]);

  const press = useCallback(
    (value: string) => {
      if (value === "clear") {
        setExpression("");
        setJustEvaluated(false);
        return;
      }

      if (value === "backspace") {
        setExpression((current) => current.slice(0, -1));
        setJustEvaluated(false);
        return;
      }

      if (value === "=") {
        if (!expression || !/[0-9)%!ei]$/i.test(expression)) return;
        try {
          const result = formatNumber(evaluateExpression(expression, angleMode));
          if (result === "Error") return;
          setHistory((current) => [
            { expression, result },
            ...current.filter((entry) => entry.expression !== expression),
          ].slice(0, 5));
          setExpression(result);
          setJustEvaluated(true);
        } catch {
          return;
        }
        return;
      }

      if (value === "sign") {
        setExpression((current) => {
          const match = current.match(/(\d+(?:\.\d*)?)$/);
          if (match) {
            const start = match.index ?? 0;
            const prefix = current.slice(0, start);
            const number = match[0];
            const unaryMinus =
              prefix.endsWith("-") &&
              (prefix.length === 1 || /[+\-*/]$/.test(prefix.slice(0, -1)));
            return unaryMinus
              ? prefix.slice(0, -1) + number
              : `${prefix}-${number}`;
          }
          if (justEvaluated && current) return `-${current}`;
          return `${current}-`;
        });
        setJustEvaluated(false);
        return;
      }

      if (/^[0-9.]$/.test(value)) {
        setExpression((current) => {
          const base = justEvaluated ? "" : current;
          if (value === ".") {
            const lastNumber = base.split(/[+\-*/%]/).at(-1) ?? "";
            if (lastNumber.includes(".")) return base;
            const multiply = /(?:[)!%]|pi|e)$/i.test(base);
            return `${base ? `${base}${multiply ? "*" : ""}` : "0"}.`;
          }
          const multiply = /(?:[)!%]|pi|e)$/i.test(base);
          return `${base}${multiply ? "*" : ""}${value}`;
        });
        setJustEvaluated(false);
        return;
      }

      if (/^[+\-*/%]$/.test(value)) {
        setExpression((current) => {
          const base = justEvaluated ? current : current;
          if (!base && value !== "-") return "";
          if (/[+\-*/]$/.test(base)) return `${base.slice(0, -1)}${value}`;
          return `${base}${value}`;
        });
        setJustEvaluated(false);
        return;
      }

      if (value === "!" && !/[0-9)!%e]$/i.test(expression)) return;
      if (value.startsWith("^") && !/[0-9)!%ei]$/i.test(expression)) return;

      setExpression((current) => {
        const base = justEvaluated ? "" : current;
        const startsOperand = /^(?:sin|cos|tan|ln|log|sqrt|abs|pi|e|\()/.test(value);
        const endsOperand = /(?:[0-9)!%]|pi|e)$/i.test(base);
        const startsNumber = /^[0-9.]$/.test(value);
        const needsMultiply = base.length > 0 && endsOperand && (startsOperand || startsNumber);
        return `${base}${needsMultiply ? "*" : ""}${value}`;
      });
      setJustEvaluated(false);
    },
    [expression, justEvaluated, angleMode],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable ||
          event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      if (/^[0-9.+\-*/%^!()]$/.test(event.key)) {
        event.preventDefault();
        press(event.key);
      } else if (event.key === "Enter" || event.key === "=") {
        event.preventDefault();
        press("=");
      } else if (event.key === "Backspace") {
        event.preventDefault();
        press("backspace");
      } else if (event.key === "Escape") {
        if (aboutOpen) {
          setAboutOpen(false);
          aboutTriggerRef.current?.focus();
        } else if (focusMode) {
          setFocusMode(false);
        } else {
          press("clear");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [press, focusMode, aboutOpen]);

  const clearHistory = () => setHistory([]);
  const adjustFontSize = (direction: -1 | 1) => {
    const currentIndex = FONT_SIZES.indexOf(fontSize as (typeof FONT_SIZES)[number]);
    const nextIndex = Math.min(FONT_SIZES.length - 1, Math.max(0, currentIndex + direction));
    setFontSize(FONT_SIZES[nextIndex]);
  };

  return (
    <main className="app-shell" data-theme={theme} data-focus={focusMode}>
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="/" aria-label="Glowy Calculator home">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M16 3.5 18.8 13l9.7 3-9.7 3-2.8 9.5L13.2 19l-9.7-3 9.7-3L16 3.5Z" />
              <path d="m25 3 1.2 4L30 8.2 26.2 9.4 25 13l-1.2-3.6L20 8.2 23.8 7 25 3Z" />
            </svg>
          </span>
          <span className="brand-name">Glowy<span>.</span></span>
        </a>

        <div className="topbar-right">
          <div className="text-size-control" role="group" aria-label="App text size">
            <button
              className="text-size-button"
              type="button"
              onClick={() => adjustFontSize(-1)}
              disabled={fontSize === FONT_SIZES[0]}
              aria-label="Decrease app text size"
              title="Decrease text size"
            >
              A−
            </button>
            <span className="text-size-value" aria-live="polite">{fontSize}%</span>
            <button
              className="text-size-button text-size-larger"
              type="button"
              onClick={() => adjustFontSize(1)}
              disabled={fontSize === FONT_SIZES[FONT_SIZES.length - 1]}
              aria-label="Increase app text size"
              title="Increase text size"
            >
              A+
            </button>
          </div>
          <button
            className={`focus-toggle${focusMode ? " focus-toggle-active" : ""}`}
            type="button"
            onClick={() => setFocusMode((current) => !current)}
            aria-pressed={focusMode}
            aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
            title={focusMode ? "Exit focus mode" : "Focus on calculator and workspace"}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d={focusMode
                ? "M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"
                : "M8 3H5a2 2 0 0 0-2 2v3m13 0V3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"} />
            </svg>
          </button>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />
              </svg>
            )}
          </button>
          <span className="live-indicator"><span /> READY TO CALCULATE</span>
          <span className="topbar-divider" />
          <span className="version">v1.0</span>
          <div
            className="developer-menu"
            ref={aboutRef}
            onMouseEnter={() => setAboutOpen(true)}
            onMouseLeave={() => setAboutOpen(false)}
            onFocus={() => setAboutOpen(true)}
            onBlur={(event) => {
              if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
                setAboutOpen(false);
              }
            }}
          >
            <button
              ref={aboutTriggerRef}
              className="developer-trigger"
              type="button"
              aria-expanded={aboutOpen}
              aria-controls="developer-popover"
              onClick={() => setAboutOpen(true)}
            >
              About developer
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="m4 6 4 4 4-4" />
              </svg>
            </button>
            <section
              className={`developer-popover${aboutOpen ? " developer-popover-open" : ""}`}
              id="developer-popover"
              aria-label="About the developer"
              aria-hidden={!aboutOpen}
            >
              <div className="developer-portrait">
                <Image
                  src="/aqeel-moshref.jpeg"
                  alt="Aqeel Moshref"
                  width={832}
                  height={1261}
                  sizes="104px"
                  unoptimized
                  priority
                />
              </div>
              <div className="developer-copy">
                <span className="developer-kicker">BUILT WITH CURIOSITY</span>
                <h2>Aqeel Moshref</h2>
                <p>Programmer <span>·</span> Revenue Assurance Analyst</p>
                <a
                  className="developer-link"
                  href="https://www.linkedin.com/in/aqeel-moshref-12144847"
                  target="_blank"
                  rel="noreferrer"
                >
                  View LinkedIn profile
                  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M6 3h7v7m0-7L5 11" />
                    <path d="M11 9v4H3V5h4" />
                  </svg>
                </a>
              </div>
            </section>
          </div>
        </div>
      </header>

      <section className="workspace" aria-label="Calculator workspace">
        <div className="intro">
          <div className="eyebrow"><span className="eyebrow-line" /> YOUR POCKET-SIZED THINKING TOOL</div>
          <h1>Make every<br />number <span>glow.</span></h1>
          <p className="intro-copy">
            A little more clarity in every calculation. Simple, focused, and ready
            whenever inspiration strikes.
          </p>
          <button
            className="what-if-launch"
            type="button"
            onClick={() => {
              setWorkspaceTab("what-if");
              if (window.matchMedia("(max-width: 780px)").matches) {
                workspacePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }}
          >
            <span className="launch-icon" aria-hidden="true">x↗</span>
            <span>
              <strong>Explore What-if Lab</strong>
              <small>See how changing a variable changes your answer</small>
            </span>
            <span className="launch-arrow" aria-hidden="true">→</span>
          </button>
          <div className="intro-footer">
            <div className="key-hint">
              <span className="keycap">↵</span>
              <span>Press enter to calculate</span>
            </div>
            <div className="key-hint">
              <span className="keycap">esc</span>
              <span>Clear everything</span>
            </div>
          </div>
        </div>

        <div className="calculator-wrap">
          <div className="calculator-glow" aria-hidden="true" />
          <section className="calculator" aria-label="Calculator">
            <div className="calculator-top">
              <div className="calculator-label">
                <span className="calculator-dot" />
                <span>{calculatorMode === "scientific" ? "SCIENTIFIC" : "STANDARD"}</span>
              </div>
              <div className="calculator-tools">
                {focusMode && (
                  <button
                    className="focus-exit"
                    type="button"
                    onClick={() => setFocusMode(false)}
                    aria-label="Exit focus mode"
                    title="Exit focus mode (Esc)"
                  >
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M8 3H5a2 2 0 0 0-2 2v3m13 0V3h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3" />
                    </svg>
                  </button>
                )}
                {calculatorMode === "scientific" && (
                  <div className="angle-switch" role="group" aria-label="Angle unit">
                    {(["DEG", "RAD"] as const).map((unit) => (
                      <button
                        className={angleMode === unit ? "angle-active" : ""}
                        key={unit}
                        type="button"
                        onClick={() => setAngleMode(unit)}
                        aria-pressed={angleMode === unit}
                      >
                        {unit}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  className="backspace-button"
                  type="button"
                  onClick={() => press("backspace")}
                  aria-label="Delete last character"
                  title="Delete last character"
                >
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M9 5H20V19H9L3 12L9 5Z" />
                    <path d="M12 9L17 15M17 9L12 15" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="display" aria-live="polite" aria-atomic="true">
              <div className="expression" title={expression || "Enter a calculation"}>
                {expression ? formatExpression(expression) : <span className="placeholder">0</span>}
                {!justEvaluated && expression && <span className="cursor" aria-hidden="true" />}
              </div>
              <div className={`result${justEvaluated ? " result-complete" : ""}`}>
                <span className="result-prefix">{justEvaluated ? "=" : "↳"}</span>
                <span className="result-value">
                  {justEvaluated ? expression : preview ?? "0"}
                </span>
              </div>
            </div>

            <div className="mode-switch" role="group" aria-label="Calculator mode">
              <button
                className={calculatorMode === "standard" ? "mode-active" : ""}
                type="button"
                onClick={() => setCalculatorMode("standard")}
                aria-pressed={calculatorMode === "standard"}
              >
                Standard
              </button>
              <button
                className={calculatorMode === "scientific" ? "mode-active" : ""}
                type="button"
                onClick={() => setCalculatorMode("scientific")}
                aria-pressed={calculatorMode === "scientific"}
              >
                Scientific
              </button>
            </div>

            {calculatorMode === "scientific" && (
              <div className="scientific-keypad" aria-label="Scientific functions">
                {scientificKeys.map((key) => (
                  <button
                    className="scientific-key"
                    key={key.value}
                    type="button"
                    onClick={() => press(key.value)}
                    aria-label={key.ariaLabel ?? key.label}
                  >
                    {key.label}
                  </button>
                ))}
              </div>
            )}

            <div className="keypad" aria-label="Calculator keys">
              {keys.map((key, index) => (
                <button
                  className={[
                    "key",
                    key.tone ? `key-${key.tone}` : "",
                    key.span ? "key-wide" : "",
                    key.value === "*" || key.value === "/" || key.value === "-" || key.value === "+" ? "key-operator" : "",
                    `key-index-${index}`,
                  ].filter(Boolean).join(" ")}
                  key={key.value}
                  type="button"
                  onClick={() => press(key.value)}
                  aria-label={key.ariaLabel ?? key.label}
                >
                  <span>{key.label}</span>
                </button>
              ))}
            </div>

            <div className="calculator-foot">
              <span>DESIGNED FOR YOUR FLOW</span>
              <span className="sparkle" aria-hidden="true">✳</span>
              <span>⌘ + ENTER</span>
            </div>
          </section>
        </div>

        <aside ref={workspacePanelRef} className="history-panel" aria-label="Calculator workspace details" tabIndex={-1}>
          <div className="history-heading">
            <div>
              <div className="section-kicker">YOUR WORKSPACE</div>
              <h2>
                {workspaceTab === "history"
                  ? <>Recent <span>thoughts</span></>
                  : workspaceTab === "formulas"
                    ? <>Formula <span>book</span></>
                    : <>What-if <span>lab</span></>}
              </h2>
            </div>
            {workspaceTab === "history" && (
              <button
                className="clear-history"
                type="button"
                onClick={clearHistory}
                disabled={history.length === 0}
                aria-label="Clear calculation history"
              >
                CLEAR
              </button>
            )}
          </div>
          <div className="workspace-tabs" role="tablist" aria-label="Workspace view">
            <button
              className={workspaceTab === "history" ? "workspace-tab-active" : ""}
              type="button"
              role="tab"
              aria-selected={workspaceTab === "history"}
              onClick={() => setWorkspaceTab("history")}
            >
              History
            </button>
            <button
              className={workspaceTab === "formulas" ? "workspace-tab-active" : ""}
              type="button"
              role="tab"
              aria-selected={workspaceTab === "formulas"}
              onClick={() => setWorkspaceTab("formulas")}
            >
              Formulas
            </button>
            <button
              className={workspaceTab === "what-if" ? "workspace-tab-active" : ""}
              type="button"
              role="tab"
              aria-selected={workspaceTab === "what-if"}
              onClick={() => setWorkspaceTab("what-if")}
            >
              What-if Lab
            </button>
          </div>
          {workspaceTab === "history" ? (
            <>
              <div className="history-list">
                {history.length > 0 ? (
                  history.map((item, index) => (
                    <button
                      className="history-item"
                      type="button"
                      key={`${item.expression}-${item.result}`}
                      onClick={() => {
                        setExpression(item.expression);
                        setJustEvaluated(false);
                      }}
                      style={{ animationDelay: `${index * 55}ms` }}
                      aria-label={`Load ${item.expression}, equals ${item.result}`}
                    >
                      <span className="history-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className="history-detail">
                        <span className="history-expression">{formatExpression(item.expression)}</span>
                        <span className="history-result">{item.result}</span>
                      </span>
                      <span className="history-arrow" aria-hidden="true">↗</span>
                    </button>
                  ))
                ) : (
                  <div className="empty-history">
                    <span className="empty-icon" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v18H7.5A2.5 2.5 0 0 1 5 18.5v-13Z" />
                        <path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H20M9 7h7M9 10h5" />
                      </svg>
                    </span>
                    <p>Your next bright idea<br />starts with a number.</p>
                    <span className="empty-caption">YOUR CALCULATIONS WILL APPEAR HERE</span>
                  </div>
                )}
              </div>
              <div className="history-note">
                <span className="note-dot" />
                <span>Saved privately on this device</span>
              </div>
            </>
          ) : workspaceTab === "formulas" ? (
            <div className="formula-list">
              {formulas.map((formula) => (
                <article className="formula-card" key={formula.name}>
                  <div className="formula-meta">
                    <span>{formula.category}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setExpression(formula.example);
                        setJustEvaluated(false);
                      }}
                      aria-label={`Try example for ${formula.name}`}
                    >
                      TRY EXAMPLE <span aria-hidden="true">↗</span>
                    </button>
                  </div>
                  <h3>{formula.name}</h3>
                  <div className="formula-expression">{formula.expression}</div>
                  <p>{formula.description}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="what-if-panel">
              <p className="what-if-intro">
                Explore how changing <span>x</span> changes your result.
                Try a scenario or enter your own formula.
              </p>
              <div className="scenario-presets" aria-label="Example scenarios">
                {whatIfExamples.map((example) => (
                  <button
                    className={whatIfExpression === example.expression ? "scenario-active" : ""}
                    key={example.label}
                    type="button"
                    onClick={() => setWhatIfExpression(example.expression)}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
              <label className="what-if-label" htmlFor="what-if-formula">FORMULA USING X</label>
              <input
                className="what-if-input"
                id="what-if-formula"
                type="text"
                value={whatIfExpression}
                onChange={(event) => setWhatIfExpression(event.target.value.slice(0, 100))}
                spellCheck={false}
                autoComplete="off"
                aria-describedby="what-if-help"
              />
              <span className="what-if-help" id="what-if-help">
                Use x, numbers, + − × ÷, powers, and scientific functions.
              </span>
              <div className="what-if-chart-wrap">
                {whatIfPlot.points ? (
                  <svg
                    className="what-if-chart"
                    viewBox="0 0 300 100"
                    role="img"
                    aria-label={`Graph of ${whatIfExpression} as x ranges from 0 to 30. ${whatIfPlot.summary}`}
                  >
                    <path className="chart-grid" d="M0 12H300M0 50H300M0 88H300" />
                    <polyline className="chart-line" points={whatIfPlot.points} />
                    <line className="chart-marker" x1={whatIfPlot.currentX} x2={whatIfPlot.currentX} y1="8" y2="91" />
                  </svg>
                ) : (
                  <div className="chart-empty" role="status">
                    Enter a valid formula using x to see its graph.
                  </div>
                )}
                <div className="chart-axis-labels" aria-hidden="true"><span>x = 0</span><span>x = 30</span></div>
              </div>
              <div className="what-if-slider-heading">
                <label htmlFor="what-if-slider">Adjust x</label>
                <output htmlFor="what-if-slider">{formatNumber(whatIfValue)}</output>
              </div>
              <input
                className="what-if-slider"
                id="what-if-slider"
                type="range"
                min="0"
                max="30"
                step="0.1"
                value={whatIfValue}
                onChange={(event) => setWhatIfValue(Number(event.target.value))}
                aria-label="Adjust x value from 0 to 30"
              />
              <div className="what-if-result" aria-live="polite">
                <span>RESULT AT x = {formatNumber(whatIfValue)}</span>
                <strong>{whatIfResult === null ? "Check your formula" : formatNumber(whatIfResult)}</strong>
              </div>
              {whatIfResult !== null && (
                <button
                  className="use-scenario"
                  type="button"
                  onClick={() => {
                    setExpression(whatIfExpression.replace(/\bx\b/gi, `(${formatNumber(whatIfValue)})`));
                    setJustEvaluated(false);
                  }}
                >
                  USE THIS RESULT IN CALCULATOR <span aria-hidden="true">↗</span>
                </button>
              )}
            </div>
          )}
        </aside>
      </section>

      <footer className="page-footer">
        <span>LESS FRICTION. MORE FLOW.</span>
        <span className="footer-center"><span /> MADE FOR THE MOMENT</span>
        <span>© GLOWY CALCULATOR</span>
      </footer>
    </main>
  );
}
