import {createSlice} from '@reduxjs/toolkit';
import client from '../../api/client';

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: {
    items: [],
    unreadCount: 0,
    loaded: false,
  },
  reducers: {
    setItems: (state, action) => {
      state.items = action.payload;
      state.loaded = true;
    },
    setUnreadCount: (state, action) => {
      state.unreadCount = action.payload;
    },
    markOneRead: (state, action) => {
      const id = action.payload;
      state.items = state.items.map(n =>
        n.id === id ? {...n, isRead: true} : n,
      );
      state.unreadCount = Math.max(0, state.unreadCount - (state.items.find(n => n.id === id && !n.isRead) ? 1 : 0));
    },
    markAllRead: state => {
      state.items = state.items.map(n => ({...n, isRead: true}));
      state.unreadCount = 0;
    },
  },
});

export const {setItems, setUnreadCount, markOneRead, markAllRead} = notificationsSlice.actions;

export const fetchNotifications = () => async dispatch => {
  try {
    const [res, countRes] = await Promise.all([
      client.get('/notification'),
      client.get('/notification/unread-count'),
    ]);
    dispatch(setItems(res.data));
    dispatch(setUnreadCount(countRes.data.count));
  } catch {
    /* ignore — screen handles errors */
  }
};

export const fetchUnreadCount = () => async dispatch => {
  try {
    const res = await client.get('/notification/unread-count');
    dispatch(setUnreadCount(res.data.count));
  } catch {
    /* ignore */
  }
};

let pollingInterval = null;

export const pollUnreadCount = () => async (dispatch, getState) => {
  if (pollingInterval) return;
  const poll = () => dispatch(fetchUnreadCount());
  poll();
  pollingInterval = setInterval(poll, 25000);
};

export const markNotificationRead = id => async dispatch => {
  try {
    await client.put(`/notification/${id}/read`);
    dispatch(markOneRead(id));
  } catch {
    /* ignore */
  }
};

export const markNotificationAllRead = () => async dispatch => {
  try {
    await client.put('/notification/read-all');
    dispatch(markAllRead());
  } catch {
    /* ignore */
  }
};

export default notificationsSlice.reducer;