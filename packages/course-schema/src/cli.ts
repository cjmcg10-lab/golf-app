import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { validateCourse } from './validate';

const dir = resolve(process.env.INIT_CWD ?? process.cwd(), process.argv[2] ?? '.');
const course = JSON.parse(readFileSync(join(dir, 'course.json'), 'utf8'));
const features = JSON.parse(readFileSync(join(dir, 'features.geojson'), 'utf8'));
const issues = validateCourse(course, features);
for (const i of issues) console.log(`${i.level.toUpperCase()} ${i.path}: ${i.message}`);
const errors = issues.filter((i) => i.level === 'error').length;
console.log(`${errors} error(s), ${issues.length - errors} warning(s)`);
process.exit(errors ? 1 : 0);
