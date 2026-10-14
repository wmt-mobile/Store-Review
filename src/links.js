export function consoleLinks(app, account, channel) {
  if (app.store === 'apple') {
    const base = `https://appstoreconnect.apple.com/apps/${app.appId}`;
    return channel === 'testflight'
      ? [{ text: 'Open TestFlight', url: `${base}/testflight/ios` }]
      : [{ text: 'Open App Store Connect', url: `${base}/distribution` }];
  }
  const links = [];
  const dev = account?.developerId;
  if (dev && app.playAppId) links.push({ text: 'Open Play Console', url: `https://play.google.com/console/u/0/developers/${dev}/app/${app.playAppId}/releases/overview` });
  else if (dev) links.push({ text: 'Open Play Console', url: `https://play.google.com/console/u/0/developers/${dev}/app-list` });
  else links.push({ text: 'Open Play Console', url: 'https://play.google.com/console' });
  return links;
}

export function primaryConsoleUrl(app, account) {
  return consoleLinks(app, account, app.store === 'apple' ? 'appstore' : 'production')[0]?.url;
}
