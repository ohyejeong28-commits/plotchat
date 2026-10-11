// 아이폰 키보드 대응.
// 키보드가 열리면 Safari는 화면 높이는 그대로 두고 페이지를 위로 밀어 올린다 → 위쪽 바가 사라지고 시계 표시와 겹친다.
// 그래서 키보드가 열린 동안만 앱 기둥(#app)의 위치와 높이를 "키보드 위로 실제로 보이는 영역"(visualViewport)에 맞추고,
// 아래 홈 바 여백을 없애 입력칸이 키보드 바로 위에 붙게 한다.
// 평소에는 화면 전체(100%)를 쓴다: 홈 화면 앱에서는 visualViewport 높이가 홈 바만큼 짧게 나와 앱이 떠 보인다.
export function initViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const update = () => {
    const full = Math.max(window.innerHeight, root.clientHeight);
    const keyboard = full - vv.height > 120;
    document.body.classList.toggle("keyboard-open", keyboard);
    if (keyboard) {
      root.style.setProperty("--app-height", `${vv.height}px`);
      root.style.setProperty("--app-top", `${vv.offsetTop}px`);
    } else {
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--app-top");
    }
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  // 입력칸을 누를 때 Safari가 페이지를 스크롤해 버리면 되돌린다
  window.addEventListener("scroll", () => {
    if (window.scrollY) window.scrollTo(0, 0);
  });
  update();
}
