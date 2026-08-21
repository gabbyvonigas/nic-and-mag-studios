import { StatusBar } from 'expo-status-bar';

import { ScanScreen } from './src/screens/ScanScreen';

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <ScanScreen />
    </>
  );
}
