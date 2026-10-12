// 아이폰 화면 높이 맞추기.
// - 키보드가 열리면 Safari는 화면 높이는 그대로 두고 페이지를 위로 밀어 올린다 → 위쪽 바가 사라지고 시계 표시와 겹친다.
//   그래서 키보드가 열린 동안만 앱 기둥(#app)의 위치와 높이를 "키보드 위로 실제로 보이는 영역"(visualViewport)에 맞추고,
//   아래 홈 바 여백을 없애 입력칸이 키보드 바로 위에 붙게 한다.
// - 평소에는 보이는 영역(100%)을 쓴다. 홈 화면 앱에서 실제 화면 높이(screen)를 쓰면 보이는 영역보다 길어져 아래가 잘린다.
// - 홈 화면 앱에서 보이는 영역이 화면 맨 아래(홈 바)까지 닿지 않는데도 홈 바 여백(safe-area)이 그대로 잡히면
//   여백이 두 번 생겨 아래가 떠 보인다. 그래서 실제로 겹치는 만큼만 --safe-bottom으로 쓴다.
export function initViewport() {
  const root = document.documentElement;
  const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

  // 확대 막기 (제타처럼): 두 손가락 확대와 두 번 탭 확대
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }

  // env(safe-area-inset-*) 값을 숫자로 읽기 위한 보이지 않는 측정용 상자
  const probe = document.createElement("div");
  probe.style.cssText = "position:fixed;left:0;top:0;width:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);";
  document.body.appendChild(probe);
  const safe = () => {
    const cs = getComputedStyle(probe);
    return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  };
  // 실제 화면 높이: 가로로 돌렸으면 짧은 쪽, 세로면 긴 쪽 (아이폰 screen 값은 늘 세로 기준이다)
  const screenHeight = () => {
    const long = Math.max(screen.width, screen.height);
    const short = Math.min(screen.width, screen.height);
    return window.innerWidth > window.innerHeight ? short : long;
  };

  const vv = window.visualViewport;
  const update = () => {
    const full = Math.max(window.innerHeight, root.clientHeight);
    const keyboard = !!vv && full - vv.height > 150;
    document.body.classList.toggle("keyboard-open", keyboard);
    if (keyboard) {
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-top", `${vv.offsetTop}px`);
    } else {
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    }
    // 홈 바 여백: 위쪽이 상태 표시줄 밑까지 덮는 홈 화면 앱에서 보이는 영역이 화면보다 짧으면, 모자란 만큼은 이미 아래가 비어 있다
    const s = safe();
    const missing = Math.max(0, screenHeight() - full);
    const bottom = standalone && s.top > 0 ? Math.max(0, s.bottom - missing) : s.bottom;
    root.style.setProperty("--safe-bottom", `${bottom}px`);
  };
  vv?.addEventListener("resize", update);
  vv?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", () => setTimeout(update, 300));
  // 입력칸을 누를 때 Safari가 페이지를 스크롤해 버리면 되돌린다
  window.addEventListener("scroll", () => {
    if (window.scrollY) window.scrollTo(0, 0);
  });
  update();
  viewportInfo.safe = safe;
}

// 화면 높이 확인용 숫자 (마이페이지 버전 줄 옆): 화면 / 창 / 보이는 영역 / 앱 / 위·아래 여백 / 실제로 쓰는 아래 여백
export function viewportInfo() {
  const app = document.getElementById("app");
  const s = viewportInfo.safe?.() || { top: 0, bottom: 0 };
  const used = getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom").trim() || "-";
  return `${screen.height} · ${window.innerHeight} · ${Math.round(window.visualViewport?.height || 0)} · ${app?.offsetHeight || 0} · ${s.top}/${s.bottom} → ${used}`;
}
