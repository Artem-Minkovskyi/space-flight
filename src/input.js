/**
 * Створює систему обробки клавіатури.
 * Стан натиснутих клавіш зберігається всередині замикання.
 */
export function createInput(target = window) {
  // Приватні набори клавіш.
  const down = new Set();
  const pressed = new Set();

  // Обробка натискання клавіші.
  function onKeyDown(event) {
    if (!down.has(event.code)) {
      pressed.add(event.code);
    }

    down.add(event.code);

    // Забороняємо прокручування сторінки стрілками.
    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
        event.code,
      )
    ) {
      event.preventDefault();
    }
  }

  // Обробка відпускання клавіші.
  function onKeyUp(event) {
    down.delete(event.code);
  }

  // Очищення клавіш при втраті фокуса вікна.
  function onBlur() {
    down.clear();
    pressed.clear();
  }

  // Реєстрація обробників подій.
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);

  return {
    // Перевіряє, чи утримується клавіша.
    isDown(code) {
      return down.has(code);
    },

    // Перевіряє, чи клавішу щойно натиснули.
    justPressed(code) {
      return pressed.has(code);
    },

    // Очищує список нових натискань після кроку симуляції.
    endStep() {
      pressed.clear();
    },

    // Видаляє обробники подій.
    destroy() {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);

      down.clear();
      pressed.clear();
    },
  };
}
