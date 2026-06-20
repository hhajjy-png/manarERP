# يولّد PDF + PNG لكل التصاميم الخمسة
import d1, d2, d3, d4, d5, render
for name, mod in [('design1',d1),('design2',d2),('design3',d3),('design4',d4),('design5',d5)]:
    render.render(mod.html(), name, dpi=200)   # ارفع الـ dpi لجودة أعلى
