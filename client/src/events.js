export class GameEvents extends EventTarget {
  emit(name, detail = {}) {
    this.dispatchEvent(
      new CustomEvent(name, {
        detail,
      }),
    );
  }
}
