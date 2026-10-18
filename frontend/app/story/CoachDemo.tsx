"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const QUESTION = "I had dosa and sambar for breakfast. What should lunch be?";
const ANSWER =
  "Breakfast was carb-heavy, so lunch can lean on protein: two rotis, a bowl of dal and a vegetable sabzi. Add a glass of buttermilk if you want something light alongside.";

export default function CoachDemo({ reduced }: { reduced: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState(reduced ? ANSWER.length : 0);
  const [showQ, setShowQ] = useState(reduced);

  useEffect(() => {
    if (reduced || !box.current) return;
    gsap.registerPlugin(ScrollTrigger);
    let timer: ReturnType<typeof setInterval> | undefined;
    let delay: ReturnType<typeof setTimeout> | undefined;
    const st = ScrollTrigger.create({
      trigger: box.current,
      start: "top 70%",
      once: true,
      onEnter: () => {
        setShowQ(true);
        delay = setTimeout(() => {
          let n = 0;
          timer = setInterval(() => {
            n += 2;
            setTyped(Math.min(n, ANSWER.length));
            if (n >= ANSWER.length && timer) clearInterval(timer);
          }, 22);
        }, 900);
      },
    });
    return () => {
      st.kill();
      if (delay) clearTimeout(delay);
      if (timer) clearInterval(timer);
    };
  }, [reduced]);

  return (
    <div className="st-chat" ref={box} aria-label="Example conversation with the NutriSync coach">
      <p className="st-chat-note">Example conversation</p>
      <div className={`st-bubble st-bubble-you ${showQ ? "on" : ""}`}>{QUESTION}</div>
      <div className={`st-bubble st-bubble-coach ${typed > 0 ? "on" : ""}`}>
        {ANSWER.slice(0, typed)}
        {typed > 0 && typed < ANSWER.length && <span className="st-caret" />}
      </div>
    </div>
  );
}
