# Design Review Results: Salary Tracker App

**Review Date**: 2026-02-11  
**Routes Reviewed**: All (/, /login, /people, /attendance, /payroll, /settings, /profile)  
**Focus Areas**: Visual Design, UX/Usability, Responsive/Mobile, Accessibility, Consistency

**Note**: This review was conducted through browser inspection and static code analysis. The app uses Vite + React with Tailwind v4 and custom CSS variables for theming.

## Summary

The Salary Tracker app demonstrates a solid, well-organized codebase with premium dark-theme design. The component architecture is clean, reusable, and shows good attention to responsive behavior. However, there are moderate accessibility violations that violate WCAG standards, particularly around landmark structure and focus management on the login page. The visual design is consistent and well-executed, but some responsive edge cases on mobile need attention. Form input accessibility is well-implemented, but semantic HTML structure needs improvement in some areas.

## Issues

| # | Issue | Criticality | Category | Location |
|---|-------|-------------|----------|----------|
| 1 | Missing `<main>` landmark on login page - content not contained by semantic regions | 🔴 Critical | Accessibility | `src/pages/LoginPage.tsx:30-114` |
| 2 | Missing `<h1>` heading on login page - violates WCAG 2.1 Level A requirement | 🔴 Critical | Accessibility | `src/pages/LoginPage.tsx:30-114` |
| 3 | Page content outside landmarks - logo, heading, and footer not contained by `<main>` or `<section>` | 🟠 High | Accessibility | `src/pages/LoginPage.tsx:30-114` |
| 4 | Button background color inheritance issue - computed as `rgba(0, 0, 0, 0)` instead of gold accent | 🟡 Medium | Visual Design | `src/components/ui/Button.tsx:26-30` |
| 5 | Focus ring offset not visible on dark background during keyboard navigation | 🟡 Medium | Accessibility | `src/components/ui/Button.tsx:21` |
| 6 | Table rows clickable but no visual feedback for keyboard focus on People page | 🟡 Medium | UX/Usability | `src/pages/People.tsx:275-279` |
| 7 | Search input in header uses hardcoded width (w-80) without responsive breakpoint for tablet | 🟡 Medium | Responsive | `src/components/layout/Header.tsx:43` |
| 8 | Icon buttons in table lack visible focus outline - only color change on hover | 🟡 Medium | Accessibility | `src/pages/People.tsx:319-342` |
| 9 | Modal lacks proper dark mode support for option elements in Select within modal | 🟠 High | Visual Design | `src/components/ui/Modal.tsx` + `src/components/ui/Select.tsx:60-72` |
| 10 | Drawer width classes use arbitrary values (w-96, w-[480px]) not in Tailwind theme | 🟡 Medium | Consistency | `src/components/ui/Drawer.tsx:30-34` |
| 11 | Bottom navigation text size (text-[10px]) may be too small for accessibility guidelines | 🟡 Medium | Accessibility | `src/components/layout/BottomNav.tsx:58-59` |
| 12 | No loading skeleton states for async data - only spinner shown, impacts perceived performance | 🟡 Medium | UX/Usability | `src/pages/Overview.tsx:97-101` |
| 13 | Employee table lacks proper column header accessibility - missing scope attributes | 🟡 Medium | Accessibility | `src/pages/People.tsx:250-271` |
| 14 | Glass effect backdrop filter may not render in older browsers - no fallback | ⚪ Low | Compatibility | `src/index.css:173-178` |
| 15 | Checkbox/Radio input components not found in UI library - may be missing form element types | 🟡 Medium | Completeness | `src/components/ui/index.ts` |
| 16 | Focus ring color (--color-focus: #6EE7FF) not adjusted for light mode contrast | 🟡 Medium | Accessibility | `src/contexts/ThemeContext.tsx:70-78` |
| 17 | No visible skip-to-content link focus state on login page - element positioned off-screen | 🟠 High | Accessibility | `src/index.css:188-200` |
| 18 | Truncated table cell content on small screens without tooltip fallback | 🟡 Medium | UX/Usability | `src/pages/People.tsx:250-356` |
| 19 | Form validation error states not clearly distinguished from normal input state on mobile | 🟡 Medium | UX/Usability | `src/components/ui/Input.tsx:29-51` |
| 20 | Modal dialog missing initial focus management - tabIndex -1 on container may steal focus from close button | 🟡 Medium | Accessibility | `src/components/ui/Modal.tsx:83-95` |

## Issues Grouped by Category

### Accessibility (10 issues)
- Missing semantic landmarks and heading structure (critical)
- Focus ring visibility and keyboard navigation
- Table headers need scope attributes
- Small font sizes in bottom nav
- Skip link not properly visible
- Initial focus management in modals
- Button focus outline coverage

### Visual Design (4 issues)
- Button background color computation issue
- Modal select element dark mode support
- Focus ring adjustment for light mode
- Glass effect fallback

### UX/Usability (5 issues)
- Missing loading states and skeleton screens
- No keyboard focus feedback on table rows
- Truncated content without tooltips
- Form error state visibility
- Missing form input types

### Responsive Design (1 issue)
- Header search input not responsive to tablet breakpoints

### Consistency (1 issue)
- Drawer widths using arbitrary Tailwind values

## Key Strengths

✅ **Excellent component composition** - Clean separation of concerns with reusable UI components  
✅ **Responsive design approach** - Well-implemented custom hooks (useBreakpoint, useIsMobile) with proper mobile/tablet/desktop breakpoints  
✅ **Strong CSS variable strategy** - Comprehensive theme tokens with light/dark mode support  
✅ **Good focus trap implementation** - Modal and Drawer handle focus correctly with restoration  
✅ **Input accessibility** - Proper aria-invalid and aria-describedby attributes on form fields  
✅ **Navigation consistency** - Bottom nav and sidebar properly implemented for responsive layouts  
✅ **Code organization** - Logical folder structure and component naming conventions

## Recommendations (Prioritized)

### 🔴 Critical (Do First)
1. **Add semantic landmarks to LoginPage**
   - Wrap main content in `<main id="main-content">` 
   - Add `<h1>` heading before "Welcome Back"
   - Wrap logo in `<header>` and footer in `<footer>`
   - Add skip-to-content link with proper focus styling

2. **Fix skip-to-content link visibility**
   - Change `top: -40px` to `top: 0` on focus
   - Add z-index higher than header
   - Make link focusable and keyboard-accessible

### 🟠 High (Do Next)
3. **Improve button background rendering**
   - Check if Button component inherits text color correctly
   - Verify `bg-[--color-accent-gold]` CSS variable is properly set
   - Test computed styles in different theme modes

4. **Enhance Modal select dark mode**
   - Extract Select styling to support better dark mode
   - Test option element colors in both themes
   - Consider custom select component for better theming control

5. **Fix table header accessibility**
   - Add `scope="col"` to `<th>` elements in People table
   - Add `scope="row"` to first `<td>` in each `<tr>` if appropriate
   - Use proper ARIA table markup

### 🟡 Medium (Plan Next Sprint)
6. **Implement loading skeleton states**
   - Create reusable skeleton component
   - Replace spinners with animated skeleton screens
   - Improves perceived performance

7. **Add keyboard focus feedback to table**
   - Add focus-visible styles to table rows
   - Implement outline or background change on focus
   - Ensure 2px focus ring visible

8. **Make header search responsive**
   - Change `w-80` to responsive classes (e.g., `w-full md:w-80`)
   - Test on 768px and 1024px breakpoints
   - Ensure adequate padding on tablet

9. **Adjust focus ring for light mode**
   - Test focus ring color (#6EE7FF) contrast on light backgrounds
   - Consider darker alternate focus color for light mode
   - Ensure minimum 3:1 contrast ratio for focus indicators

10. **Improve bottom nav text size**
    - Change `text-[10px]` to `text-xs` (12px) for better readability
    - Ensure minimum 16px in form inputs per WCAG guidelines
    - Test on actual mobile devices

### ⚪ Low (Nice to Have)
11. **Add glass effect fallback**
    - Provide solid color fallback for backdrop-filter unsupported browsers
    - Use `@supports` query for progressive enhancement

## Testing Recommendations

### Browser & Device Testing
- [ ] Test keyboard navigation across all pages (Tab, Shift+Tab, Enter, Escape)
- [ ] Test focus indicators on dark and light themes
- [ ] Test on real mobile devices (iOS Safari, Android Chrome)
- [ ] Test high contrast mode (Windows High Contrast)
- [ ] Test with screen reader (NVDA, JAWS on Windows)

### Accessibility Testing
- [ ] Run axe-core audit on all pages (currently shows 3 critical violations on login)
- [ ] Run WAVE browser extension
- [ ] Manual focus management testing
- [ ] Color contrast verification with WebAIM tool

### Responsive Testing
- [ ] 320px, 375px, 768px, 1024px, 1440px viewport sizes
- [ ] Test landscape orientation on mobile
- [ ] Test with system font scaling enabled
- [ ] Test zoom levels (100%, 125%, 150%)

## Next Steps

1. **Immediate**: Fix critical accessibility violations on login page (landmarks, headings)
2. **This Sprint**: Resolve high-priority button and table accessibility issues
3. **Next Sprint**: Implement medium-priority improvements (loading states, focus feedback, responsive refinements)
4. **Ongoing**: Regular accessibility audits with each page release

## Audit Details

### Performance Metrics (from login page)
- **First Contentful Paint**: 4,060ms (target: < 3,000ms)
- **Largest Contentful Paint**: 4,200ms (target: < 2,500ms)
- **Cumulative Layout Shift**: 0.002 (excellent, target: < 0.1)
- **First Input Delay**: 1ms (excellent)
- **Time to Interactive**: 4,060ms (target: < 5,000ms)

### Color Contrast Status
✅ WCAG AA standard appears met for main text colors based on CSS variables  
✅ Gold accent (#D8B04C) on dark background shows good contrast  
⚠️ Focus ring (#6EE7FF) may need adjustment for light mode backgrounds

### Browser Support
- Modern browsers: Full support
- CSS variables: Requires modern browser support (IE11 not supported)
- Backdrop-filter: Requires CSS Backdrop Filter support

---

**Review conducted using**: Vite dev server, Chrome DevTools, axe-core accessibility audit, and manual code analysis.
