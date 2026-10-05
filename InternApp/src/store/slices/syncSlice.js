import {createSlice} from '@reduxjs/toolkit';

const syncSlice = createSlice({
  name: 'sync',
  initialState: {
    isOnline: true,
    items: [],
    localNotifications: [],
    lastSyncAt: null,
  },
  reducers: {
    setOnline: (state, action) => {
      state.isOnline = !!action.payload;
    },
    setItems: (state, action) => {
      state.items = action.payload;
    },
    upsertItem: (state, action) => {
      const item = action.payload;
      const idx = state.items.findIndex(i => i.id === item.id);
      if (idx >= 0) state.items[idx] = item;
      else state.items.push(item);
    },
    removeItem: (state, action) => {
      state.items = state.items.filter(i => i.id !== action.payload);
    },
    setLastSyncAt: (state, action) => {
      state.lastSyncAt = action.payload;
    },
    addLocalNotification: (state, action) => {
      const n = action.payload;
      state.localNotifications = [{...n, id: n.id || `${Date.now()}`}, ...state.localNotifications].slice(
        0,
        100,
      );
    },
    markLocalNotificationRead: (state, action) => {
      const id = action.payload;
      state.localNotifications = state.localNotifications.map(n =>
        n.id === id ? {...n, isRead: true} : n,
      );
    },
    markAllLocalNotificationRead: state => {
      state.localNotifications = state.localNotifications.map(n => ({...n, isRead: true}));
    },
  },
});

export const {
  setOnline,
  setItems,
  upsertItem,
  removeItem,
  setLastSyncAt,
  addLocalNotification,
  markLocalNotificationRead,
  markAllLocalNotificationRead,
} = syncSlice.actions;

export default syncSlice.reducer;