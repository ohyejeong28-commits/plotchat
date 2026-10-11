// 아이폰 화면 높이 맞추기.
// - 키보드가 열리면 Safari는 화면 높이는 그대로 두고 페이지를 위로 밀어 올린다 → 위쪽 바가 사라지고 시계 표시와 겹친다.
//   그래서 키보드가 열린 동안만 앱 기둥(#app)의 위치와 높이를 "키보드 위로 실제로 보이는 영역"(visualViewport)에 맞추고,
//   아래 홈 바 여백을 없애 입력칸이 키보드 바로 위에 붙게 한다.
// - 홈 화면 앱(standalone)에서는 100%도 visualViewport도 실제 화면보다 짧게 잡혀 아래가 떠 보인다.
//   그래서 평소에는 실제 화면 높이(screen)를 직접 쓴다. 일반 브라우저에서는 100%를 쓴다.
export function initViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  // 실제 화면 높이: 가로로 돌렸으면 짧은 쪽, 세로면 긴 쪽 (아이폰 screen 값은 늘 세로 기준이다)
  const screenHeight = () => {
    const long = Math.max(screen.width, screen.height);
    const short = Math.min(screen.width, screen.height);
    return window.innerWidth > window.innerHeight ? short : long;
  };
  const update = () => {
    const full = standalone ? Math.max(screenHeight(), window.innerHeight) : Math.max(window.innerHeight, root.clientHeight);
    const keyboard = full - vv.height > 150;
    document.body.classList.toggle("keyboard-open", keyboard);
    if (keyboard) {
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-top", `${vv.offsetTop}px`);
    } else if (standalone) {
      root.style.setProperty("--app-height", `${full}px`);
      root.style.setProperty("--app-top", "0px");
    } else {
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    }
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  window.addEventListener("orientationchange", () => setTimeout(update, 300));
  // 입력칸을 누를 때 Safari가 페이지를 스크롤해 버리면 되돌린다
  window.addEventListener("scroll", () => {
    if (window.scrollY) window.scrollTo(0, 0);
  });
  update();
}

// 화면 높이 확인용 숫자 (마이페이지 버전 줄 옆): 화면 / 창 / 보이는 영역 / 앱
export function viewportInfo() {
  const app = document.getElementById("app");
  return `${screen.height} · ${window.innerHeight} · ${Math.round(window.visualViewport?.height || 0)} · ${app?.offsetHeight || 0}`;
}
