import React from 'react';
import {ScrollView, Text, View, StyleSheet} from 'react-native';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {error: null};
  }

  static getDerivedStateFromError(error) {
    return {error};
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) {
      const {message, stack} = this.state.error;
      return (
        <View style={styles.container}>
          <Text style={styles.title}>App Error</Text>
          <Text style={styles.msg}>{message}</Text>
          <ScrollView style={styles.scroll}>
            <Text style={styles.stack}>{stack}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#1a0000', padding: 20, paddingTop: 50},
  title: {color: '#ff6b6b', fontSize: 20, fontWeight: '800', marginBottom: 12},
  msg: {color: '#fff', fontSize: 14, marginBottom: 12},
  scroll: {flex: 1, backgroundColor: '#000', borderRadius: 8, padding: 10},
  stack: {color: '#ffb3b3', fontSize: 11, fontFamily: 'monospace'},
});
