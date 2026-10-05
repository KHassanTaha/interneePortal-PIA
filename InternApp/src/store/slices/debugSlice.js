import {createSlice} from '@reduxjs/toolkit';

// In-memory developer overrides (in-memory only — never persisted).
// This whole section is temporary and will be removed along with the
// home-page debug panel once the dependent flows are verified.
const debugSlice = createSlice({
  name: 'debug',
  initialState: {
    simulateLocation: false,
    simulateFace: 'off', // 'off' | 'enrolled' | 'notEnrolled'
    simulateDocsUploaded: 'off', // 'off' | 'uploaded' | 'notUploaded'
  },
  reducers: {
    setSimulateLocation: (state, action) => {
      state.simulateLocation = !!action.payload;
    },
    setSimulateFace: (state, action) => {
      const v = ['off', 'enrolled', 'notEnrolled'];
      state.simulateFace = v.includes(action.payload) ? action.payload : 'off';
    },
    setSimulateDocsUploaded: (state, action) => {
      const v = ['off', 'uploaded', 'notUploaded'];
      state.simulateDocsUploaded = v.includes(action.payload) ? action.payload : 'off';
    },
    resetDebug: state => {
      state.simulateLocation = false;
      state.simulateFace = 'off';
      state.simulateDocsUploaded = 'off';
    },
  },
});

export const {
  setSimulateLocation,
  setSimulateFace,
  setSimulateDocsUploaded,
  resetDebug,
} = debugSlice.actions;
export default debugSlice.reducer;