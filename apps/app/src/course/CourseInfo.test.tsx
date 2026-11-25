// @vitest-environment jsdom
import type { Course } from '@golf/course-schema';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Linking } from 'react-native';
import { afterEach, expect, test, vi } from 'vitest';
import { CourseInfo } from './CourseInfo';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const course = (over: Partial<Course> = {}) =>
  ({
    name: 'Southington Country Club',
    address: '150 Savage Street, Plantsville, CT 06479',
    website: 'https://www.southingtoncountryclub.com/',
    contacts: [
      { label: 'Tee times & course conditions', phone: '+18606287032' },
      { label: 'Back Nine Tavern (restaurant & bar)', phone: '+18606216383' },
    ],
    attribution: ['© OpenStreetMap contributors (ODbL)'],
    ...over,
  }) as unknown as Course;

test('callButtonsPerContact', () => {
  const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  render(<CourseInfo course={course()} />);
  const buttons = screen.getAllByRole('button', { name: /^Call / });
  expect(buttons).toHaveLength(2);
  expect(screen.getByText('(860) 621-6383')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Call Tee times & course conditions' }));
  expect(open).toHaveBeenCalledWith('tel:+18606287032');
});

test('noContactsShowsWebsiteOnly', () => {
  render(<CourseInfo course={course({ contacts: [] })} />);
  expect(screen.queryAllByRole('button', { name: /^Call / })).toHaveLength(0);
  expect(screen.getByText('No phone numbers listed')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Website' })).toBeTruthy();
});

test('showsAttribution', () => {
  render(<CourseInfo course={course()} />);
  expect(screen.getByText('© OpenStreetMap contributors (ODbL)')).toBeTruthy();
});
