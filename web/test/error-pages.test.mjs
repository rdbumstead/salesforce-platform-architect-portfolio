import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoutes, ERROR_PAGES } from '../build/routes.mjs';

const errorRoutes = () => readRoutes().routes.filter((route) => route.errorCode);

test('ERROR_PAGES names the 404, 429 and 503 views', () => {
  assert.deepEqual(ERROR_PAGES, { error: '404', tooManyRequests: '429', serviceNotAvailable: '503' });
  assert.deepEqual(errorRoutes().map((route) => route.file).sort(), ['404.html', '429.html', '503.html']);
});

test('every error page is drawn in the site layout, so it gets the footer', () => {
  errorRoutes().forEach((route) => assert.equal(route.layout, 'portfolio', route.file));
});

test('every error page has a tab title that ends with the site name', () => {
  const titles = Object.fromEntries(errorRoutes().map((route) => [route.errorCode, route.title]));
  assert.equal(titles['404'], 'Page not found | Ryan Bumstead');
  assert.equal(titles['429'], 'Too many requests | Ryan Bumstead');
  assert.equal(titles['503'], 'Service not available | Ryan Bumstead');
});

test('every error page has an error label, a link home and one message', () => {
  errorRoutes().forEach((route) => {
    const messages = route.components.filter((component) => component.name === 'messagePage');
    assert.equal(messages.length, 1, route.file);
    const props = messages[0].props;
    assert.equal(props.eyebrow, `Error ${route.errorCode}`, route.file);
    assert.equal(props.showHome, true, route.file);
    assert.ok(props.heading && props.body, route.file);
  });
});

test('the busy and unavailable pages offer Try again and never reload on a timer', () => {
  errorRoutes()
    .filter((route) => route.errorCode !== '404')
    .forEach((route) => {
      assert.equal(route.autoRefresh, false, `${route.file} has a timed refresh, which fails the meta-refresh rule`);
      const props = route.components.find((component) => component.name === 'messagePage').props;
      assert.equal(props.retryLabel, 'Try again', route.file);
    });
});
