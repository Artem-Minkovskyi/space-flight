export function createLobbyDOM(container, lobby) {
  container.innerHTML = `
    <div class="lobby-card">
      <p class="eyebrow">SPACE FLIGHT · MULTIPLAYER</p>
      <h2>КОСМІЧНЕ ЛОБІ</h2>

      <label for="player-name">ІМ'Я ГРАВЦЯ</label>
      <input
        id="player-name"
        type="text"
        maxlength="20"
        placeholder="Введіть своє ім'я"
        autocomplete="nickname"
      />

      <div class="lobby-heading">
        <h3>ВИБІР КІМНАТИ</h3>
        <span id="lobby-status">Завантаження...</span>
      </div>

      <div id="room-list" class="room-list"></div>

      <p id="lobby-error" class="lobby-error"></p>

      <button id="join-room" type="button" disabled>
        ПРИЄДНАТИСЯ
      </button>
    </div>
  `;

  const nameInput = container.querySelector('#player-name');
  const roomList = container.querySelector('#room-list');
  const statusElement = container.querySelector('#lobby-status');
  const errorElement = container.querySelector('#lobby-error');
  const joinButton = container.querySelector('#join-room');

  let selectedRoomId = null;

  function renderRooms(rooms) {
    const previousSelection = selectedRoomId;

    roomList.replaceChildren();

    if (!rooms.length) {
      statusElement.textContent = 'Немає кімнат';
      joinButton.disabled = true;
      selectedRoomId = null;
      return;
    }

    statusElement.textContent = `${rooms.length} кімнат`;

    rooms.forEach((room) => {
      const card = document.createElement('button');

      card.type = 'button';
      card.className = 'room-card';
      card.classList.toggle('selected', room.id === previousSelection);

      card.innerHTML = `
        <strong></strong>
        <span></span>
        <small></small>
      `;

      card.querySelector('strong').textContent = room.name;
      card.querySelector('span').textContent = room.description;
      card.querySelector('small').textContent =
        `${room.arena.width} × ${room.arena.height} · ` +
        `${room.arena.asteroids} астероїдів`;

      card.addEventListener('click', () => {
        selectedRoomId = room.id;

        roomList.querySelectorAll('.room-card').forEach((item) => {
          item.classList.remove('selected');
        });

        card.classList.add('selected');
        joinButton.disabled = !nameInput.value.trim();
        errorElement.textContent = '';
      });

      roomList.append(card);
    });

    if (!rooms.some((room) => room.id === previousSelection)) {
      selectedRoomId = null;
    }

    joinButton.disabled = !selectedRoomId || !nameInput.value.trim();
  }

  nameInput.addEventListener('input', () => {
    joinButton.disabled = !selectedRoomId || !nameInput.value.trim();
  });

  joinButton.addEventListener('click', () => {
    errorElement.textContent = '';

    try {
      lobby.join(nameInput.value, selectedRoomId);
    } catch (error) {
      errorElement.textContent = error.message;
    }
  });

  lobby.addEventListener('roomsUpdated', (event) => {
    renderRooms(event.detail.rooms);
  });

  lobby.addEventListener('error', (event) => {
    statusElement.textContent = 'Помилка завантаження';
    errorElement.textContent = event.detail.error.message;
  });

  return {
    destroy() {
      container.replaceChildren();
    },
  };
}
