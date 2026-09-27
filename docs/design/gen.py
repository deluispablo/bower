# Generates the app screens of the redesign into ./screens/ (the same files
# make up the lead's review canvas). Revised 28 Sep after the audit. One bird drawing (BIRD_CORE, v8.2),
# one stylesheet (CSS: every pose as keyframes), one function per screen.
# Python 3, no packages. Run: python3 gen.py
import json, os, re

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screens')
os.makedirs(OUT, exist_ok=True)

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&family=Source+Sans+3:wght@400;600&family=JetBrains+Mono&display=swap" rel="stylesheet">')

# ---------------------------------------------------------------- the bird
# viewBox 0 0 100 100, feet on y=91, facing right. Round body, round head
# that overlaps it and turns on the neck, one big eye, a small beak with a
# jaw, a leaf wing that starts at the shoulder, a short cocked tail, feet.
BIRD_CORE = (
    '<g class="tl"><rect class="tf" x="6" y="71" width="24" height="5.5" rx="2.75" transform="rotate(-54 30 74)"></rect><rect class="tf" x="4" y="73" width="26" height="5.5" rx="2.75" transform="rotate(-36 30 76)"></rect><rect class="tf" x="6" y="75" width="24" height="5.5" rx="2.75" transform="rotate(-18 30 78)"></rect></g>'
    '<g class="ft"><path class="lg" d="M40 84V91"></path><rect class="fo" x="34" y="89" width="13" height="4.5" rx="2.25"></rect><path class="lg" d="M53 85V91"></path><rect class="fo" x="47" y="89" width="13" height="4.5" rx="2.25"></rect></g>'
    '<circle class="bd" cx="46" cy="62" r="24"></circle>'
    '<ellipse class="ch" cx="52" cy="72" rx="13" ry="10"></ellipse>'
    '<g class="hd">'
    '<rect class="nk" x="52" y="34" width="16" height="38" rx="8"></rect>'
    '<circle class="hc" cx="62" cy="40" r="19"></circle>'
    '<circle class="ck" cx="72" cy="47" r="3.2"></circle>'
    '<g class="ey"><circle class="ec" cx="68" cy="37" r="5.2"></circle><circle class="eh" cx="70" cy="35" r="1.9"></circle><circle class="eh" cx="66.4" cy="39.2" r=".9"></circle></g>'
    '<circle class="ld" cx="68" cy="24.5" r="6.5"></circle><circle class="lb" cx="68" cy="49" r="6.5"></circle>'
    '<rect class="bk" x="79" y="35" width="13" height="6" rx="3"></rect><g class="jw"><rect class="bj" x="79" y="40" width="10" height="4.5" rx="2.25"></rect></g>'
    '<path class="x ctwig tw" d="M86 39L100 24M96 28L103 27"></path>'
    '<rect class="x cpaper pp" x="86" y="34" width="13" height="17" rx="1" transform="rotate(14 92 42)"></rect>'
    '<text class="x ex" x="74" y="16">!</text>'
    '</g>'
    '<g class="wg"><path class="wp" d="M54 56C64 58 65 68 58 74C44 78 28 78 18 72C28 64 42 56 54 56Z"></path></g>'
    '<circle class="x dd d1" cx="50" cy="20" r="1.6"></circle><circle class="x dd d2" cx="56" cy="16" r="1.6"></circle><circle class="x dd d3" cx="62" cy="14" r="1.6"></circle>'
    '<text class="x nt" x="82" y="22">♪</text><text class="x nt n2" x="90" y="14">♪</text><text class="x nt n3" x="76" y="8">♪</text>'
    '<text class="x qm" x="80" y="18">?</text>'
    '<text class="x zz" x="74" y="22">z</text><text class="x zz z2" x="82" y="12">z</text>'
    '<path class="x sp" d="M90 8l1.8 3.8 3.8 1.8-3.8 1.8L90 19l-1.8-3.8-3.8-1.8 3.8-1.8z"></path><path class="x sp sp2" d="M8 26l1.4 3 3 1.4-3 1.4L8 35l-1.4-3-3-1.4 3-1.4z"></path>'
    '<path class="x cl" d="M50 6h18a5 5 0 0 0-.6-10 7 7 0 0 0-13 2A4 4 0 0 0 50 6z"></path><path class="x rn r1" d="M52 9v5"></path><path class="x rn r2" d="M58 10v5"></path><path class="x rn r3" d="M64 9v5"></path><path class="x rn r4" d="M70 10v5"></path><path class="x nest2" d="M22 82C26 94 68 94 72 82M26 88L68 84M30 92L64 88M28 84L70 90M24 86L40 82M54 82L70 86"></path>'
)
SCENE = (
    '<g><path class="x tray" d="M-46 78H-6L-10 92H-42Z"></path>'
    '<rect class="x traypaper" x="-36" y="70" width="18" height="12" rx="1" style="fill:#fff;stroke:#9fabbf;stroke-width:1;transform:rotate(-6deg);transform-box:fill-box;transform-origin:center"></rect>'
    '<path class="x nest" d="M104 84C108 96 140 96 144 84M108 90L140 86M112 94L136 90M110 86L142 92M106 88L120 84M128 84L142 88"></path>'
    '<rect class="x nestpile np1" x="112" y="76" width="16" height="10" rx="1"></rect>'
    '<path class="x tw np2" d="M116 82L134 72"></path>'
    '<path class="x bp bp1" d="M6 92L28 86"></path><path class="x bp bp2" d="M10 94L30 90"></path><path class="x bp bp3" d="M14 90L34 88"></path>'
    '<path class="x bn" d="M64 84C68 96 102 96 106 84M70 90L100 86"></path><path class="x bn bt1" d="M72 87L98 91"></path><path class="x bn bt2" d="M68 83L90 87"></path><path class="x bn bt3" d="M80 82L104 88"></path>'
    '<circle class="x sgem" cx="108" cy="30" r="7"></circle><circle class="x sgemhl" cx="105.5" cy="27.5" r="2.2"></circle>'
    '<path class="x sp sspark" d="M120 14l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z"></path><path class="x sp sspark s2" d="M98 44l1.2 2.6 2.6 1.2-2.6 1.2-1.2 2.6-1.2-2.6-2.6-1.2 2.6-1.2z"></path></g>'
)

def bird(pose='', size=64, style='', scene=False):
    return ('<svg class="b %s" viewBox="0 0 100 100" width="%d" height="%d" aria-hidden="true" style="%s">%s<g class="rig"><g class="turn">%s</g></g></svg>'
            % (pose, size, size, style, SCENE if scene else '', BIRD_CORE))

CSS = r"""
body{margin:0;font-family:'Source Sans 3',system-ui,sans-serif;background:#111a2b;color:#dfe5ee}
a{color:#5fcfbc}a:hover{color:#8fe0d2}
.b{overflow:visible;display:block;flex-shrink:0}
.b .bd,.b .hc,.b .nk,.b .ld,.b .lb{fill:#5fcfbc}.b .wp,.b .tf{fill:#2f9c8d}.b .ch{fill:#b9ece2;opacity:.9}.b .ck{fill:#b9ece2;opacity:.8}.b .ec{fill:#1b2233}.b .eh{fill:#fff}.b .fo{fill:#f0b64f}.b .dd{fill:#9fabbf}.b .rn{fill:none;stroke:#7d8aa3;stroke-width:1.6;stroke-linecap:round}.b .nest2{fill:none;stroke:#8a5a3b;stroke-width:2.4;stroke-linecap:round}.b .ex{font-family:Poppins,sans-serif;font-weight:700;font-size:16px;fill:#f0b64f}.b .ld,.b .lb{transform-box:fill-box;transform-origin:center}.b .tu{transform-box:fill-box;transform-origin:95% 60%}.b .nest{fill:none;stroke:#8a5a3b;stroke-width:2.4;stroke-linecap:round}
.b .bk{fill:#f0b64f}.b .bj{fill:#d9952e}
.b .lg{fill:none;stroke:#f0b64f;stroke-width:3.6;stroke-linecap:round;stroke-linejoin:round}
.b .tw{fill:none;stroke:#f0b64f;stroke-width:2.6;stroke-linecap:round}
.b .pp,.b .nestpile{fill:#fff;stroke:#9fabbf;stroke-width:1}
.b .nt{font-family:Poppins,sans-serif;font-weight:700;font-size:13px;fill:#8fe0d2}
.b .qm,.b .zz{font-family:Poppins,sans-serif;font-weight:700;fill:#dfe5ee}.b .qm{font-size:18px}.b .zz{font-size:12px}
.b .sp{fill:#f0b64f;transform-box:fill-box;transform-origin:center}
.b .cl{fill:none;stroke:#7d8aa3;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.b .bp,.b .bn{fill:none;stroke:#8a5a3b;stroke-width:2.4;stroke-linecap:round}.b .bp{stroke:#f0b64f}
.b .tray{fill:#3b4a66}.b .sgem{fill:#38bdf8}.b .sgemhl{fill:#e0f2fe}
.b .rig,.b .turn{transform-box:fill-box;transform-origin:50% 100%}
.b .hd{transform-box:view-box;transform-origin:60px 64px}
.b .jw{transform-box:fill-box;transform-origin:0% 15%}
.b .wg{transform-box:view-box;transform-origin:54px 57px}
.b .tl{transform-box:view-box;transform-origin:30px 76px}
.b .ft{transform-box:view-box;transform-origin:47px 84px}
.b .ey{transform-box:fill-box;transform-origin:center}
.b .x{opacity:0}
.p-idle .rig{animation:breathe 3.2s ease-in-out infinite}.p-idle .ey{animation:blink 4.5s infinite}
.p-look .rig{animation:breathe 3.2s ease-in-out infinite}.p-look .turn{animation:turnaround 11s ease-in-out infinite}.p-look .hd{animation:idlelook 11s ease-in-out infinite}.p-look .tl{animation:tailflick 11s ease-in-out infinite}.p-look .ey{animation:blink 4.5s infinite}.p-look .ft{animation:shift 11s ease-in-out infinite}.p-look .dd{animation:dots 11s infinite}.p-look .d2{animation-delay:.25s}.p-look .d3{animation-delay:.5s}
.p-hello .rig{animation:arrive 4.5s ease-out infinite}.p-hello .wg{animation:arrivewing 4.5s linear infinite}.p-hello .ft{animation:landlegs 4.5s ease-out infinite}.p-hello .jw{animation:chirp 4.5s linear infinite}.p-hello .hd{animation:landlook 4.5s ease-out infinite}.p-hello .tu{animation:tuftpop 4.5s ease-out infinite}.p-hello .lb{animation:smile 4.5s ease-out infinite}.p-hello .ey{animation:blink 4.5s infinite}.p-hello .tl{animation:tailsettle 4.5s ease-out infinite}
.p-shiny .rig{animation:excite 3s ease-in-out infinite}.p-shiny .hd{animation:reach 3s ease-in-out infinite}.p-shiny .tu{transform:rotate(-55deg)}.p-shiny .ex{animation:bang 3s ease-out infinite}.p-shiny .s2{animation-delay:.5s}.p-shiny .ey{animation:dilate 3s ease-in-out infinite}.p-shiny .ft{animation:shinylegs 3s ease-in-out infinite}.p-shiny .wg{animation:flutter .16s linear infinite alternate}.p-shiny .tl{animation:tailwag .5s ease-in-out infinite alternate}.p-shiny .sgem,.p-shiny .sgemhl{opacity:1}.p-shiny .sspark{opacity:1;animation:twinkle 1s ease-in-out infinite}
.p-sing .rig{animation:bounce 1s ease-in-out infinite}.p-sing .hd{animation:singhead 2s ease-in-out infinite}.p-sing .lb{transform:translateY(-6px)}.p-sing .tu{transform:rotate(-40deg)}.p-sing .wg{animation:sway 1s ease-in-out infinite alternate}.p-sing .jw{animation:sing .45s ease-in-out infinite alternate}.p-sing .tl{animation:tailwag .25s ease-in-out infinite alternate}.p-sing .nt{opacity:1;animation:notes 2.4s ease-out infinite}.p-sing .n2{animation-delay:.8s}.p-sing .n3{animation-delay:1.6s}.p-sing .ey{animation:blink 4.5s infinite}
.p-tidy .rig{animation:ferry 6s ease-in-out infinite}.p-tidy .turn{animation:ferryturn 6s linear infinite}.p-tidy .wg{animation:flap .2s ease-in-out infinite alternate}.p-tidy .ft{transform:scaleY(.4)}.p-tidy .lb{transform:translateY(-6px)}.p-tidy .tu{transform:rotate(-45deg)}.p-tidy .tl{animation:tailstream 6s linear infinite}.p-tidy .cpaper{animation:cpaper 6s linear infinite}.p-tidy .ctwig{animation:ctwig 6s linear infinite}.p-tidy .tray,.p-tidy .nest,.p-tidy .traypaper{opacity:1}.p-tidy .np1{animation:np1 6s linear infinite}.p-tidy .np2{animation:np2 6s linear infinite}
.p-fly .rig{animation:bob .5s ease-in-out infinite alternate}.p-fly .wg{animation:flap .2s ease-in-out infinite alternate}.p-fly .ft{transform:scaleY(.4)}.p-fly .lb{transform:translateY(-6px)}.p-fly .tl{transform:rotate(-16deg)}.p-fly .cpaper{opacity:1}
.p-dance .rig{animation:strut 3.6s ease-in-out infinite}.p-dance .wg{animation:wingspread 3.6s ease-in-out infinite}.p-dance .tl{animation:tailfan 3.6s ease-in-out infinite}.p-dance .hd{animation:proudhead 3.6s ease-in-out infinite}.p-dance .jw{transform:rotate(10deg)}.p-dance .ft{animation:steps .45s ease-in-out infinite alternate}.p-dance .lb{transform:translateY(-6px)}.p-dance .tu{animation:tuftdance 3.6s ease-in-out infinite}.p-dance .sp{opacity:1;animation:twinkle 1.2s ease-in-out infinite}.p-dance .sp2{animation-delay:.5s}
.p-confused .rig{animation:breathe 3.2s ease-in-out infinite}.p-confused .hd{animation:puzzle 3.2s ease-in-out infinite}.p-confused .wg{animation:shrug 3.2s ease-in-out infinite}.p-confused .tu{transform:rotate(18deg) translateY(2px)}.p-confused .ld{transform:translateY(3px)}.p-confused .qm{opacity:1;animation:rise 3.2s ease-in-out infinite}.p-confused .ey{animation:blink 4.5s infinite}
.p-build .rig{animation:build 7.2s ease-in-out infinite}.p-build .hd{animation:buildhead 7.2s ease-in-out infinite}.p-build .ctwig{animation:buildtwig 7.2s linear infinite}.p-build .ft{animation:buildlegs2 7.2s ease-in-out infinite}.p-build .wg{animation:buildwing 7.2s ease-in-out infinite}.p-build .lb{transform:translateY(-5px)}.p-build .bn{opacity:1}.p-build .bp{opacity:1}.p-build .bp1{animation:bp1 7.2s linear infinite}.p-build .bp2{animation:bp2 7.2s linear infinite}.p-build .bp3{animation:bp3 7.2s linear infinite}.p-build .bt1{animation:bt1 7.2s linear infinite}.p-build .bt2{animation:bt2 7.2s linear infinite}.p-build .bt3{animation:bt3 7.2s linear infinite}.p-build .ey{animation:blink 4.5s infinite}
.p-sleep .rig{--rest:5px;animation:breathe 4.8s ease-in-out infinite}.p-sleep .nest2{opacity:1}.p-sleep .ft{transform:scaleY(0)}.p-sleep .wg{transform:rotate(-8deg)}.p-sleep .ld{transform:translateY(10px)}.p-sleep .lb{transform:translateY(-5px)}.p-sleep .hd{transform:translate(-2px,8px) rotate(12deg)}.p-sleep .zz{opacity:1;animation:drift 3s ease-in-out infinite}.p-sleep .z2{animation-delay:1.2s}
.p-peek .hd{animation:peekup 4s ease-in-out infinite}.p-peek .ey{animation:look 3s ease-in-out infinite}
.p-offline .rig{filter:saturate(.35) brightness(.85)}.p-offline .cl{opacity:1}.p-offline .rn{opacity:1;animation:rain 1s linear infinite}.p-offline .r2{animation-delay:.25s}.p-offline .r3{animation-delay:.5s}.p-offline .r4{animation-delay:.75s}.p-offline .ld{transform:translateY(5px)}.p-offline .hd{transform:rotate(8deg) translateY(3px)}.p-offline .wg{transform:rotate(112deg)}.p-offline .ft{transform:scaleY(.8)}.p-offline .ey{animation:blink 6s infinite}
.p-done .rig{animation:hopwink 3s ease-in-out infinite}.p-done .ey{animation:wink 3s linear infinite}.p-done .jw{transform:rotate(12deg)}.p-done .lb{transform:translateY(-6px)}.p-done .wg{animation:cheer 3s ease-in-out infinite}.p-done .ft{animation:crouch 3s ease-in-out infinite}.p-done .hd{animation:cheerhead 3s ease-in-out infinite}.p-done .tl{animation:tailwag .5s ease-in-out infinite alternate}
.e-happy .jw{transform:rotate(16deg)}.e-happy .hd{transform:rotate(-6deg) translateY(-3px)}.e-happy .lb{transform:translateY(-6px)}.e-happy .tu{transform:rotate(-30deg)}
.e-curious .ey{transform:scale(1.35)}.e-curious .hd{transform:rotate(-14deg) translate(3px,-9px)}.e-curious .tu{transform:rotate(-50deg)}
.e-worried .ld{transform:translateY(5px)}.e-worried .hd{transform:rotate(12deg) translateY(4px)}.e-worried .tu{transform:rotate(16deg) translateY(2px)}
.e-sleepy .ld{transform:translateY(10px)}.e-sleepy .lb{transform:translateY(-5px)}.e-sleepy .hd{transform:translate(-2px,8px) rotate(12deg)}
.e-proud .hd{transform:rotate(-16deg) translateY(-8px)}.e-proud .tl{transform:scale(1.2) rotate(-14deg)}.e-proud .wg{transform:rotate(-70deg)}.e-proud .jw{transform:rotate(8deg)}.e-proud .lb{transform:translateY(-6px)}.e-proud .tu{transform:rotate(-60deg)}
.flip .turn{transform:scaleX(-1)}
@keyframes breathe{0%,100%{transform:translateY(var(--rest,0px))}50%{transform:translateY(calc(var(--rest,0px) - 1.5px))}}
@keyframes blink{0%,91%,97%,100%{transform:scaleY(1)}94%{transform:scaleY(.1)}}
@keyframes turnaround{0%,60%{transform:scaleX(1)}63%,86%{transform:scaleX(-1)}89%,100%{transform:scaleX(1)}}
@keyframes idlelook{0%,10%,100%{transform:rotate(0) translateY(0)}16%,28%{transform:rotate(-16deg) translateY(-7px)}34%,40%{transform:rotate(0) translateY(0)}44%,52%{transform:rotate(14deg) translateY(3px)}56%{transform:rotate(0) translateY(0)}66%,80%{transform:rotate(-8deg) translateY(-9px)}88%{transform:rotate(4deg) translateY(0)}}
@keyframes tailflick{0%,38%,46%,100%{transform:rotate(0)}40%{transform:rotate(-18deg)}43%{transform:rotate(8deg)}}
@keyframes arrive{0%{transform:translate(-150px,-60px) rotate(-8deg)}26%{transform:translate(-8px,-6px) rotate(0)}30%{transform:translate(0,0) scale(1.14,.84)}38%{transform:scale(.97,1.04)}44%{transform:scale(1)}58%{transform:scaleY(.9)}64%{transform:translateY(-14px) scaleY(1.06)}72%{transform:translateY(0) scale(1.08,.92)}78%,100%{transform:scale(1)}}
@keyframes arrivewing{0%{transform:rotate(44deg)}2%{transform:rotate(-18deg)}4%{transform:rotate(44deg)}6%{transform:rotate(-18deg)}8%{transform:rotate(44deg)}10%{transform:rotate(-18deg)}12%{transform:rotate(44deg)}14%{transform:rotate(-18deg)}16%{transform:rotate(44deg)}18%{transform:rotate(-18deg)}20%{transform:rotate(44deg)}22%{transform:rotate(-18deg)}24%{transform:rotate(44deg)}26%{transform:rotate(-18deg)}28%{transform:rotate(44deg)}30%,100%{transform:rotate(0)}}
@keyframes tuck{0%,26%{transform:scaleY(.3)}30%,100%{transform:scaleY(1)}}
@keyframes chirp{0%,44%,56%,100%{transform:rotate(0)}47%,53%{transform:rotate(24deg)}50%{transform:rotate(4deg)}}
@keyframes landlook{0%,28%{transform:rotate(6deg)}34%,48%{transform:rotate(-12deg)}56%,100%{transform:rotate(0)}}
@keyframes excite{0%,18%{transform:translateX(0) scale(1)}22%{transform:scale(1.06,.9)}30%{transform:translateY(-10px) scale(.96,1.08)}36%{transform:translateX(6px) scale(1.08,.92)}42%{transform:translateX(6px) scale(1)}56%{transform:translateX(6px) scale(1.06,.9)}64%{transform:translate(12px,-10px) scale(.96,1.08)}70%{transform:translateX(18px) scale(1.08,.92)}76%,100%{transform:translateX(18px) scale(1)}}
@keyframes lean{0%,100%{transform:rotate(-12deg) translate(2px,-3px)}50%{transform:rotate(-16deg) translate(4px,-4px)}}
@keyframes dilate{0%,100%{transform:scale(1.2)}50%{transform:scale(1.4)}}
@keyframes flutter{from{transform:rotate(10deg)}to{transform:rotate(45deg)}}
@keyframes tailwag{from{transform:rotate(-10deg)}to{transform:rotate(10deg)}}
@keyframes bounce{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-4px) scale(1.02,.98)}}
@keyframes singhead{0%,100%{transform:rotate(-16deg) translateY(-2px)}50%{transform:rotate(-22deg) translateY(-3px)}}
@keyframes sing{from{transform:rotate(4deg)}to{transform:rotate(26deg)}}
@keyframes notes{0%{opacity:0;transform:translate(0,4px)}15%{opacity:1}100%{opacity:0;transform:translate(10px,-30px) rotate(12deg)}}
@keyframes ferry{0%,4%{transform:translateX(34px)}16%{transform:translateX(-34px) translateY(-14px)}20%{transform:translateX(-34px) scale(1.08,.92)}26%{transform:translateX(-34px)}42%{transform:translateX(34px) translateY(-16px)}46%{transform:translateX(34px) scale(1.08,.92)}52%{transform:translateX(34px)}64%{transform:translateX(-34px) translateY(-14px)}68%{transform:translateX(-34px) scale(1.08,.92)}74%{transform:translateX(-34px)}90%{transform:translateX(34px) translateY(-16px)}94%{transform:translateX(34px) scale(1.08,.92)}100%{transform:translateX(34px)}}
@keyframes ferryturn{0%,24%{transform:scaleX(-1)}26%,50%{transform:scaleX(1)}52%,72%{transform:scaleX(-1)}74%,100%{transform:scaleX(1)}}
@keyframes flap{from{transform:rotate(60deg)}to{transform:rotate(-10deg)}}
@keyframes bob{from{transform:translateY(0)}to{transform:translateY(-3px)}}
@keyframes cpaper{0%,24%{opacity:0}26%,46%{opacity:1}48%,100%{opacity:0}}
@keyframes ctwig{0%,72%{opacity:0}74%,94%{opacity:1}96%,100%{opacity:0}}
@keyframes np1{0%,46%{opacity:0}48%,100%{opacity:1}}
@keyframes np2{0%,94%{opacity:0}96%,100%{opacity:1}}
@keyframes strut{0%,100%{transform:translateX(0) rotate(0)}10%{transform:translateX(-10px) rotate(-5deg)}20%{transform:translateX(10px) rotate(5deg)}30%{transform:translateX(-10px) rotate(-5deg)}40%{transform:translateX(0) rotate(0)}52%,68%{transform:rotate(24deg)}80%{transform:rotate(0) translateY(-10px)}88%{transform:translateY(0) scale(1.08,.92)}94%{transform:scale(1)}}
@keyframes wingspread{0%,44%,100%{transform:rotate(0) scale(1)}50%,66%{transform:rotate(75deg) scale(1.15,1.1)}}
@keyframes tailfan{0%,44%,100%{transform:scale(1)}50%,70%{transform:scale(1.35) rotate(-14deg)}}
@keyframes proudhead{0%,44%,100%{transform:rotate(0)}50%,70%{transform:rotate(-14deg) translateY(-2px)}}
@keyframes twinkle{0%,100%{opacity:.2;transform:scale(.7)}50%{opacity:1;transform:scale(1.15)}}
@keyframes puzzle{0%,100%{transform:rotate(-14deg) translateY(1px)}45%,55%{transform:rotate(16deg) translateY(2px)}}
@keyframes shrug{0%,30%,70%,100%{transform:rotate(0) translateY(0)}40%,60%{transform:rotate(30deg) translateY(-6px)}}
@keyframes rise{0%,25%{opacity:0;transform:translateY(4px)}45%,80%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-4px)}}
@keyframes buildhop{0%,100%{transform:translateX(-22px)}12%{transform:translateX(-22px) translateY(-10px)}25%{transform:translateX(22px) scale(1.06,.94)}30%{transform:translateX(22px) scale(1)}37%{transform:translateX(22px) translateY(-10px)}50%{transform:translateX(-22px) scale(1.06,.94)}55%{transform:translateX(-22px) scale(1)}62%{transform:translateX(-22px) translateY(-10px)}75%{transform:translateX(22px) scale(1.06,.94)}80%{transform:translateX(22px) scale(1)}87%{transform:translateX(22px) translateY(-10px)}}
@keyframes draw{0%{stroke-dashoffset:40}20%,88%{stroke-dashoffset:0}92%,100%{stroke-dashoffset:40}}
@keyframes drift{0%{opacity:0;transform:translate(0,4px)}30%{opacity:1}100%{opacity:0;transform:translate(6px,-18px)}}
@keyframes peekup{0%,60%,100%{transform:translateY(0) rotate(0)}68%,74%{transform:translateY(-14px) rotate(-10deg)}80%,88%{transform:translateY(-14px) rotate(12deg)}}
@keyframes tailsettle{0%,28%{transform:rotate(-24deg)}31%{transform:rotate(16deg)}35%{transform:rotate(-10deg)}39%{transform:rotate(5deg)}43%,100%{transform:rotate(0)}}@keyframes tailstream{0%,4%,26%,52%,74%,100%{transform:rotate(0)}8%,22%,30%,48%,56%,70%,78%,96%{transform:rotate(-20deg)}}@keyframes pump{0%,20%,60%,100%{transform:rotate(0)}30%,50%{transform:rotate(-80deg)}}
@keyframes buildlegs{0%,4%,16%,29%,41%,54%,66%,79%,91%,100%{transform:scaleY(1)}8%,33%,58%,83%{transform:scaleY(.65)}12%,37%,62%,87%{transform:scaleY(1.2)}}
@keyframes crouch{0%,60%,100%{transform:scaleY(1)}20%{transform:scaleY(.65)}32%{transform:scaleY(1.2)}44%{transform:scaleY(.7)}52%{transform:scaleY(1)}}
@keyframes cheer{0%,12%{transform:rotate(0)}22%,70%{transform:rotate(105deg)}30%,46%,62%{transform:rotate(120deg)}38%,54%{transform:rotate(95deg)}82%,100%{transform:rotate(0)}}
@keyframes cheerhead{0%,12%,82%,100%{transform:rotate(0) translateY(0)}22%,70%{transform:rotate(-12deg) translateY(-4px)}}
@keyframes rain{0%{opacity:0;transform:translateY(0)}20%{opacity:1}100%{opacity:0;transform:translateY(12px)}}
@keyframes steps{from{transform:skewX(-14deg)}to{transform:skewX(14deg)}}
@keyframes shift{0%,58%,66%,100%{transform:skewX(0)}60%{transform:skewX(-10deg)}63%{transform:skewX(8deg)}}
@keyframes landlegs{0%,26%{transform:scaleY(.3)}30%{transform:scaleY(.7)}38%{transform:scaleY(1.05)}44%,56%{transform:scaleY(1)}60%{transform:scaleY(.7)}66%{transform:scaleY(1.15)}72%{transform:scaleY(.75)}78%,100%{transform:scaleY(1)}}
@keyframes shinylegs{0%,18%,42%,76%,100%{transform:scaleY(1)}22%,56%{transform:scaleY(.65)}30%,64%{transform:scaleY(1.2)}36%,70%{transform:scaleY(.75)}}
@keyframes build{0.00%{transform:translateX(14px)}2.00%{transform:translateX(14px) scale(1.06,.92)}4.67%{transform:translateX(-14px) translateY(-16px)}7.33%{transform:translateX(-44px) scale(1.08,.92)}8.67%{transform:translateX(-44px)}16.67%{transform:translateX(-44px)}18.67%{transform:translateX(-44px) scale(1.06,.92)}21.33%{transform:translateX(-14px) translateY(-16px)}24.00%{transform:translateX(14px) scale(1.08,.92)}25.33%{transform:translateX(14px)}33.30%{transform:translateX(14px)}33.33%{transform:translateX(14px)}35.33%{transform:translateX(14px) scale(1.06,.92)}38.00%{transform:translateX(-14px) translateY(-16px)}40.67%{transform:translateX(-44px) scale(1.08,.92)}42.00%{transform:translateX(-44px)}50.00%{transform:translateX(-44px)}52.00%{transform:translateX(-44px) scale(1.06,.92)}54.67%{transform:translateX(-14px) translateY(-16px)}57.33%{transform:translateX(14px) scale(1.08,.92)}58.67%{transform:translateX(14px)}66.63%{transform:translateX(14px)}66.67%{transform:translateX(14px)}68.67%{transform:translateX(14px) scale(1.06,.92)}71.33%{transform:translateX(-14px) translateY(-16px)}74.00%{transform:translateX(-44px) scale(1.08,.92)}75.33%{transform:translateX(-44px)}83.33%{transform:translateX(-44px)}85.33%{transform:translateX(-44px) scale(1.06,.92)}88.00%{transform:translateX(-14px) translateY(-16px)}90.67%{transform:translateX(14px) scale(1.08,.92)}92.00%{transform:translateX(14px)}99.97%{transform:translateX(14px)}}@keyframes buildhead{0.00%{transform:rotate(0) translate(0,0)}9.33%{transform:rotate(0) translate(0,0)}12.00%{transform:rotate(34deg) translate(2px,4px)}14.67%{transform:rotate(34deg) translate(2px,4px)}16.67%{transform:rotate(-6deg) translate(0,-3px)}25.33%{transform:rotate(-6deg) translate(0,-3px)}28.00%{transform:rotate(30deg) translate(2px,4px)}30.67%{transform:rotate(30deg) translate(2px,4px)}33.30%{transform:rotate(0) translate(0,0)}33.33%{transform:rotate(0) translate(0,0)}42.67%{transform:rotate(0) translate(0,0)}45.33%{transform:rotate(34deg) translate(2px,4px)}48.00%{transform:rotate(34deg) translate(2px,4px)}50.00%{transform:rotate(-6deg) translate(0,-3px)}58.67%{transform:rotate(-6deg) translate(0,-3px)}61.33%{transform:rotate(30deg) translate(2px,4px)}64.00%{transform:rotate(30deg) translate(2px,4px)}66.63%{transform:rotate(0) translate(0,0)}66.67%{transform:rotate(0) translate(0,0)}76.00%{transform:rotate(0) translate(0,0)}78.67%{transform:rotate(34deg) translate(2px,4px)}81.33%{transform:rotate(34deg) translate(2px,4px)}83.33%{transform:rotate(-6deg) translate(0,-3px)}92.00%{transform:rotate(-6deg) translate(0,-3px)}94.67%{transform:rotate(30deg) translate(2px,4px)}97.33%{transform:rotate(30deg) translate(2px,4px)}99.97%{transform:rotate(0) translate(0,0)}}@keyframes buildtwig{0.00%{opacity:0}13.00%{opacity:0}13.33%{opacity:1}29.33%{opacity:1}29.67%{opacity:0}33.30%{opacity:0}33.33%{opacity:0}46.33%{opacity:0}46.67%{opacity:1}62.67%{opacity:1}63.00%{opacity:0}66.63%{opacity:0}66.67%{opacity:0}79.67%{opacity:0}80.00%{opacity:1}96.00%{opacity:1}96.33%{opacity:0}99.97%{opacity:0}}@keyframes buildlegs2{0.00%{transform:scaleY(1)}2.00%{transform:scaleY(.65)}4.67%{transform:scaleY(1.2)}7.33%{transform:scaleY(.7)}10.00%{transform:scaleY(1)}16.67%{transform:scaleY(1)}18.67%{transform:scaleY(.65)}21.33%{transform:scaleY(1.2)}24.00%{transform:scaleY(.7)}26.67%{transform:scaleY(1)}33.30%{transform:scaleY(1)}33.33%{transform:scaleY(1)}35.33%{transform:scaleY(.65)}38.00%{transform:scaleY(1.2)}40.67%{transform:scaleY(.7)}43.33%{transform:scaleY(1)}50.00%{transform:scaleY(1)}52.00%{transform:scaleY(.65)}54.67%{transform:scaleY(1.2)}57.33%{transform:scaleY(.7)}60.00%{transform:scaleY(1)}66.63%{transform:scaleY(1)}66.67%{transform:scaleY(1)}68.67%{transform:scaleY(.65)}71.33%{transform:scaleY(1.2)}74.00%{transform:scaleY(.7)}76.67%{transform:scaleY(1)}83.33%{transform:scaleY(1)}85.33%{transform:scaleY(.65)}88.00%{transform:scaleY(1.2)}90.67%{transform:scaleY(.7)}93.33%{transform:scaleY(1)}99.97%{transform:scaleY(1)}}@keyframes buildwing{0.00%{transform:rotate(0)}2.67%{transform:rotate(50deg)}4.67%{transform:rotate(-8deg)}6.67%{transform:rotate(40deg)}8.67%{transform:rotate(0)}18.67%{transform:rotate(0)}20.00%{transform:rotate(50deg)}21.33%{transform:rotate(-8deg)}23.33%{transform:rotate(40deg)}25.33%{transform:rotate(0)}33.30%{transform:rotate(0)}33.33%{transform:rotate(0)}36.00%{transform:rotate(50deg)}38.00%{transform:rotate(-8deg)}40.00%{transform:rotate(40deg)}42.00%{transform:rotate(0)}52.00%{transform:rotate(0)}53.33%{transform:rotate(50deg)}54.67%{transform:rotate(-8deg)}56.67%{transform:rotate(40deg)}58.67%{transform:rotate(0)}66.63%{transform:rotate(0)}66.67%{transform:rotate(0)}69.33%{transform:rotate(50deg)}71.33%{transform:rotate(-8deg)}73.33%{transform:rotate(40deg)}75.33%{transform:rotate(0)}85.33%{transform:rotate(0)}86.67%{transform:rotate(50deg)}88.00%{transform:rotate(-8deg)}90.00%{transform:rotate(40deg)}92.00%{transform:rotate(0)}99.97%{transform:rotate(0)}}@keyframes bp1{0%{opacity:1}12.99%{opacity:1}13.00%{opacity:0}100%{opacity:0}}@keyframes bp2{0%{opacity:1}46.32%{opacity:1}46.33%{opacity:0}100%{opacity:0}}@keyframes bp3{0%{opacity:1}79.66%{opacity:1}79.67%{opacity:0}100%{opacity:0}}@keyframes bt1{0%{opacity:0}29.49%{opacity:0}29.50%{opacity:1}100%{opacity:1}}@keyframes bt2{0%{opacity:0}62.82%{opacity:0}62.83%{opacity:1}100%{opacity:1}}@keyframes bt3{0%{opacity:0}96.16%{opacity:0}96.17%{opacity:1}100%{opacity:1}}
@keyframes dots{0%,12%,100%{opacity:0}16%,26%{opacity:1}30%,64%{opacity:0}68%,78%{opacity:1}82%{opacity:0}}
@keyframes reach{0%,14%{transform:rotate(0) translate(0,0)}22%,100%{transform:rotate(-18deg) translate(4px,-12px)}}
@keyframes bang{0%,10%{opacity:0;transform:scale(.4)}16%,40%{opacity:1;transform:scale(1)}50%,100%{opacity:0}}
@keyframes tuftpop{0%,30%{transform:rotate(0)}36%,60%{transform:rotate(-55deg)}72%,100%{transform:rotate(0)}}
@keyframes smile{0%,30%{transform:translateY(0)}36%,100%{transform:translateY(-6px)}}
@keyframes sway{from{transform:rotate(-10deg)}to{transform:rotate(-40deg)}}
@keyframes tuftdance{0%,40%,100%{transform:rotate(-20deg)}52%,80%{transform:rotate(-65deg)}}
@keyframes twigset{0%,26%,50%,76%,100%{transform:rotate(0)}34%,42%{transform:rotate(30deg) translate(2px,3px)}84%,92%{transform:rotate(30deg) translate(2px,3px)}}
@keyframes peck{0%,26%,50%,76%,100%{transform:rotate(0) translate(0,0)}34%,42%{transform:rotate(26deg) translate(3px,5px)}84%,92%{transform:rotate(26deg) translate(3px,5px)}}
@keyframes look{0%,100%{transform:translateX(-2px)}50%{transform:translateX(2px)}}
@keyframes hopwink{0%,100%{transform:translateY(0)}20%{transform:scale(1.08,.88)}32%{transform:translateY(-16px) scale(.95,1.08)}44%{transform:translateY(0) scale(1.12,.88)}52%{transform:scale(1)}}
@keyframes wink{0%,50%,62%,100%{transform:scaleY(1)}53%,59%{transform:scaleY(.1)}}
.ring{animation:ring 2s ease-out infinite}
@keyframes ring{0%{box-shadow:0 0 0 0 rgba(95,207,188,.6)}100%{box-shadow:0 0 0 14px rgba(95,207,188,0)}}
.ico{width:22px;height:22px;flex-shrink:0;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.tab{display:flex;flex-direction:column;align-items:center;gap:3px;flex:1;min-height:52px;justify-content:center;text-decoration:none;font-size:12px;font-weight:600;color:#9fabbf}
.tab.on{color:#5fcfbc}
.h1{margin:0;font-family:Poppins,sans-serif;font-weight:700;font-size:24px;line-height:1.15;letter-spacing:-.3px;color:#f1f5f9}
.h2{margin:0;font-family:Poppins,sans-serif;font-weight:600;font-size:17px;color:#f1f5f9}
.k{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#7d8aa3;font-weight:600}
.muted{color:#9fabbf}
.card{padding:14px;border-radius:14px;background:#1a2538;border:1px solid #2c3a54}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border:none;border-radius:12px;background:#5fcfbc;color:#0b1220;font:600 16px 'Source Sans 3',sans-serif;text-decoration:none;cursor:pointer}
.btn2{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border:1px solid #3b4a66;border-radius:12px;background:transparent;color:#dfe5ee;font:600 15px 'Source Sans 3',sans-serif;text-decoration:none;cursor:pointer}
.link{min-height:44px;display:inline-flex;align-items:center;color:#9fabbf;font-size:15px;text-decoration:none}
.row{display:flex;align-items:center;gap:12px;min-height:56px;padding:0 10px;border-radius:10px;text-decoration:none;color:#dfe5ee}
.pill{display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:0 14px;border:none;border-radius:999px;background:#5fcfbc;color:#0b1220;font:600 15px 'Source Sans 3',sans-serif;cursor:pointer}
.chip{min-height:34px;padding:0 12px;border:1px solid #3b4a66;border-radius:999px;background:transparent;color:#cbd5e1;font:14px 'Source Sans 3',sans-serif;cursor:pointer}
.tag{padding:1px 8px;border-radius:6px;background:rgba(95,207,188,.16);color:#8fe0d2;font-size:13px;text-decoration:none}
.wl{color:#8fe0d2;text-decoration:underline dotted;text-underline-offset:3px}
.kbd{font-family:'JetBrains Mono',monospace;font-size:11px;padding:2px 6px;border:1px solid #3b4a66;border-radius:6px;color:#9fabbf}
.tog{position:relative;width:44px;height:26px;border-radius:13px;background:#5fcfbc;flex-shrink:0}
.tog::after{content:'';position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:#111a2b}
.tog.off{background:#3b4a66}.tog.off::after{right:auto;left:3px;background:#9fabbf}
.field{display:flex;flex-direction:column;gap:6px}
.field label{font-size:13px;color:#9fabbf}
.field input,.field textarea{min-height:44px;padding:10px 12px;border-radius:10px;border:1px solid #2c3a54;background:#1a2538;color:#dfe5ee;font:15px 'Source Sans 3',sans-serif}
.dots{display:flex;gap:6px;justify-content:center}
.dots span{width:6px;height:6px;border-radius:3px;background:#2c3a54}.dots span.on{width:18px;background:#5fcfbc}
.prose p{margin:0 0 14px;font-size:17px;line-height:1.6}
.prose h2{margin:22px 0 8px;font-family:Poppins,sans-serif;font-weight:600;font-size:20px;color:#f1f5f9}
.prose li{font-size:17px;line-height:1.55;margin-bottom:4px}
"""

def page(title, body, w, h, props=None, extra_css=''):
    p = props or {}
    p['$preview'] = {'width': w, 'height': h}
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>%s</title>\n<script src="./support.js"></script>\n</head>\n<body>\n<x-dc>\n<helmet>\n%s\n<style>%s%s</style>\n</helmet>\n%s\n</x-dc>\n<script type="text/x-dc" data-dc-script data-props=\'%s\'>\nclass Component extends DCLogic {\n  renderVals() {\n    return {};\n  }\n}\n</script>\n</body>\n</html>\n'
            % (title, FONTS, CSS, extra_css, body, json.dumps(p)))

# ---------------------------------------------------------------- icons
I = {
 'home': '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"></path>',
 'plus': '<path d="M12 5v14M5 12h14"></path>',
 'chat': '<path d="M4 5h16v11H9l-5 4z"></path>',
 'cog': '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"></path><circle cx="15" cy="7" r="2"></circle><circle cx="9" cy="17" r="2"></circle>',
 'search': '<circle cx="11" cy="11" r="6"></circle><path d="M20 20l-4.5-4.5"></path>',
 'folder': '<path d="M3 6a1 1 0 0 1 1-1h4.5l1.5 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z"></path>',
 'note': '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4M9 12h6M9 16h6"></path>',
 'inbox': '<path d="M3 13l2-8h14l2 8v6H3z"></path><path d="M3 13h5l1.5 2h5L16 13h5"></path>',
 'back': '<path d="M15 6l-6 6 6 6"></path>',
 'next': '<path d="M9 6l6 6-6 6"></path>',
 'heart': '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"></path>',
 'menu': '<path d="M4 7h16M4 12h16M4 17h16"></path>',
 'x': '<path d="M6 6l12 12M18 6L6 18"></path>',
 'check': '<path d="M5 12l4 4L19 6"></path>',
 'ext': '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"></path>',
 'camera': '<path d="M4 8h3l2-3h6l2 3h3v11H4z"></path><circle cx="12" cy="13" r="3.5"></circle>',
 'file': '<path d="M6 3h8l4 4v14H6z"></path><path d="M14 3v4h4"></path>',
 'link': '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"></path><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"></path>',
 'bell': '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"></path><path d="M10 20a2 2 0 0 0 4 0"></path>',
 'send': '<path d="M4 12l16-8-6 16-2-6z"></path>',
 'clock': '<circle cx="12" cy="12" r="8"></circle><path d="M12 8v4l3 2"></path>',
 'more': '<circle cx="5" cy="12" r="1.3"></circle><circle cx="12" cy="12" r="1.3"></circle><circle cx="19" cy="12" r="1.3"></circle>',
 'tag': '<path d="M3 12l9-9h9v9l-9 9z"></path><circle cx="16" cy="8" r="1.4"></circle>',
 'cal': '<rect x="4" y="5" width="16" height="15" rx="2"></rect><path d="M4 10h16M9 3v4M15 3v4"></path>',
 'moon': '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"></path>',
 'sun': '<circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"></path>',
 'warn': '<path d="M12 4l9 16H3z"></path><path d="M12 10v4M12 17v.5"></path>',
 'wifi': '<path d="M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a4 4 0 0 1 4 0"></path><circle cx="12" cy="19" r="1"></circle>',
 'trash': '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path>',
 'key': '<circle cx="8" cy="12" r="4"></circle><path d="M12 12h9M18 12v3M15 12v2"></path>',
 'user': '<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
 'drive': '<path d="M9 4h6l6 10-3 6H6l-3-6z"></path><path d="M3 14h18M9 4l3 10"></path>',
 'sort': '<path d="M4 7h12M4 12h8M4 17h4M18 10v10M15 17l3 3 3-3"></path>',
 'collapse': '<path d="M6 9l6-6 6 6M6 15l6 6 6-6"></path>',
 'eye': '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"></path><circle cx="12" cy="12" r="3"></circle>',
 'eyeoff': '<path d="M3 3l18 18M10 6a10 10 0 0 1 12 6 13 13 0 0 1-3 3.5M6.5 6.5A13 13 0 0 0 2 12s4 7 10 7a9 9 0 0 0 4-1"></path>',
 'bowerfolder': '<path d="M3 6a1 1 0 0 1 1-1h4.5l1.5 2H20a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z"></path><path d="M9 13h6M12 10v6"></path>',
 'info': '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
 'pin': '<path d="M12 17v5M8 3h8l-1 6 3 3H6l3-3z"></path>',
 'shield': '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path>',
}
def ico(n, extra=''):
    return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"%s>%s</svg>' % ((' style="%s"' % extra) if extra else '', I[n])

# ---------------------------------------------------------------- phone chrome
def tabs(active):
    items = [('Home', 'home', 'Phone-Home.dc.html'), ('Add', 'plus', 'Phone-Add.dc.html'), ('Tell', 'chat', 'Phone-Tell.dc.html'), ('Settings', 'cog', 'Phone-Settings.dc.html')]
    out = '<nav aria-label="Primary" style="display:flex;padding:6px 8px 22px;border-top:1px solid #2c3a54;background:#0b1120">'
    for label, icon, href in items:
        on = ' on' if label == active else ''
        cur = ' aria-current="page"' if label == active else ''
        out += '<a class="tab%s" href="%s"%s>%s%s</a>' % (on, href, cur, ico(icon), label)
    return out + '</nav>'

def topbar(left, right=''):
    return '<header style="display:flex;align-items:center;gap:8px;min-height:60px;padding:8px 12px 0">%s<span style="flex-grow:1"></span>%s</header>' % (left, right)

def iconbtn(icon, label):
    return '<button type="button" aria-label="%s" style="width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:10px;background:transparent;color:#9fabbf;cursor:pointer">%s</button>' % (label, ico(icon))

def backlink(label, href):
    return '<a href="%s" style="display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 8px;border-radius:10px;color:#9fabbf;text-decoration:none;font-size:15px">%s%s</a>' % (href, ico('back'), label)

MENU = '<a href="Phone-Files.dc.html" aria-label="Your notes" style="width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;color:#9fabbf;margin-left:-4px">' + ico('menu') + '</a>'
PILL = '<button type="button" class="pill">Tidy up (3)</button>'
def title_top(title, right=''):
    return topbar(MENU + '<h1 class="h1" style="font-size:20px;padding-left:4px">%s</h1>' % title, right + PILL)
BRAND = '<a href="Phone-Home.dc.html" aria-label="Bower home" style="display:flex;align-items:center;gap:8px;text-decoration:none;padding-left:4px">%s<span style="font-family:Poppins,sans-serif;font-weight:700;font-size:20px;color:#f1f5f9">Bower</span></a>' % ''

def phone(inner, nav=None, bg='#111a2b'):
    return '<div style="width:390px;height:844px;box-sizing:border-box;display:flex;flex-direction:column;background:%s;overflow:hidden">%s%s</div>' % (bg, inner, tabs(nav) if nav else '')

def dim_home(alpha='.7'):
    return ('<div aria-hidden="true" style="position:absolute;inset:0;padding:68px 16px 0;display:flex;flex-direction:column;gap:18px;opacity:.3">'
            '<div style="height:64px;border-radius:14px;background:#1a2538"></div><div style="height:44px;border-radius:12px;background:#1a2538"></div>'
            '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px"><div style="height:104px;border-radius:14px;background:#1a2538"></div><div style="height:104px;border-radius:14px;background:#1a2538"></div></div>'
            '<div style="height:220px;border-radius:14px;background:#1a2538"></div></div>'
            '<div aria-hidden="true" style="position:absolute;inset:0;background:rgba(8,13,24,%s)"></div>' % alpha)

PIN_ITEMS = [('folder', 'Flat hunt', '1-Projects · 12 notes', 'Phone-Folder.dc.html'), ('note', 'Shopping list', '2-Areas / Home', 'Phone-Note.dc.html'), ('chat', 'Answers', '6 notes', 'Phone-Folder.dc.html'), ('note', 'Sourdough starter', '2-Areas / Cooking', 'Phone-Note.dc.html')]
def pin_tile(icon, name, meta, href, extra=''):
    return ('<a href="%s" class="card" style="display:flex;align-items:center;gap:10px;padding:10px 12px;min-height:56px;text-decoration:none;color:#dfe5ee%s">%s<span style="display:flex;flex-direction:column;gap:1px;min-width:0"><span style="font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">%s</span><span style="font-size:12px;color:#9fabbf;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">%s</span></span></a>'
            % (href, extra, ico(icon, 'width:20px;height:20px;color:' + ('#f0b64f' if icon == 'folder' else '#9fabbf')), name, meta))
PINS = ''.join(pin_tile(*p) for p in PIN_ITEMS)
def home_body(theme='dark'):
    return ('<div style="flex-grow:1;overflow:hidden;padding:12px 16px 0;display:flex;flex-direction:column;gap:18px">'
      '<div style="display:flex;align-items:flex-end;gap:8px;padding-top:4px">' + bird('p-look', 88, 'margin-bottom:-8px') +
      '<div style="display:flex;flex-direction:column;gap:6px;min-width:0"><h1 class="h1">Good evening, Alex</h1>'
      '<div style="padding:10px 14px;border-radius:14px;border-bottom-left-radius:4px;background:#1a2538;border:1px solid #2c3a54;font-size:15px;line-height:1.4">Three new things in your inbox. Shall I tidy up?</div></div></div>'
      '<a href="Phone-Switcher.dc.html" style="display:flex;align-items:center;gap:10px;min-height:44px;padding:0 14px;border-radius:12px;background:#1a2538;border:1px solid #2c3a54;color:#9fabbf;font-size:15px;text-decoration:none">' + ico('search') + '<span>Search or jump to a note</span></a>'
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">'
      '<div class="card" style="display:flex;flex-direction:column;gap:6px"><div style="display:flex;align-items:center;gap:8px;color:#9fabbf;font-size:13px;font-weight:600">' + ico('inbox', 'width:18px;height:18px') + 'Inbox</div><div style="font-family:Poppins,sans-serif;font-weight:700;font-size:34px;line-height:1">3</div><div style="font-size:13px;color:#9fabbf">waiting to be tidied</div></div>'
      '<a href="#top" class="card" style="display:flex;flex-direction:column;gap:6px;text-decoration:none;color:#dfe5ee"><div style="display:flex;align-items:center;gap:8px;color:#9fabbf;font-size:13px;font-weight:600">' + ico('chat', 'width:18px;height:18px') + 'Answers</div><div style="font-family:Poppins,sans-serif;font-weight:700;font-size:34px;line-height:1">6</div><div style="font-size:13px;color:#9fabbf">things Bower answered</div></a></div>'
      '<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:baseline;justify-content:space-between;padding:0 2px"><h2 class="h2">Pinned</h2><a href="Phone-Home-Pins.dc.html" class="link" style="min-height:28px;font-size:13px;color:#8fe0d2">Edit</a></div>'
      '<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">' + PINS + '</div></div>'
      '<div style="display:flex;flex-direction:column;gap:2px"><div style="display:flex;align-items:baseline;justify-content:space-between;padding:0 2px 8px"><h2 class="h2">Recent</h2><span style="font-size:13px;color:#9fabbf">Updated 4 min ago</span></div>'
      + ''.join('<a class="row" href="Phone-Note.dc.html">%s<span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:16px;font-weight:600">%s</span><span style="font-size:13px;color:#9fabbf">%s</span></span></a>' % (ico('note', 'color:#9fabbf'), n, m) for n, m in [
          ('Sourdough starter', '2-Areas / Cooking · 2 h'), ('Trip to Lisbon', '1-Projects · yesterday'), ('Car insurance renewal', '2-Areas / Finance · 3 d'), ('What did I save about trip planning?', 'Answers · 5 d')])
      + '</div></div>')

HOME_TOP = topbar(MENU + BRAND, PILL)

def coach(step, title, body, bird_html, bubble_pos, tail_style, nav_active=None, highlight_top=None, next_href='', next_label='Next', extra=''):
    inner = '<div style="width:390px;height:844px;box-sizing:border-box;position:relative;background:#111a2b;overflow:hidden">' + dim_home()
    if highlight_top:
        inner += highlight_top
    if nav_active:
        inner += '<div style="position:absolute;left:0;right:0;bottom:0">' + tabs(nav_active).replace('class="tab on"', 'class="tab on ring" style="border-radius:14px;background:#1a2538;outline:2px solid #5fcfbc"') + '</div>'
    inner += bird_html
    inner += ('<div style="position:absolute;left:16px;right:16px;%s;display:flex;flex-direction:column;gap:14px;padding:18px;border-radius:16px;background:#1a2538;border:1px solid #2c3a54;box-shadow:0 16px 48px rgba(0,0,0,.5)">'
              '<div aria-hidden="true" style="position:absolute;%s;width:16px;height:16px;background:#1a2538;transform:rotate(45deg)"></div>'
              '<div class="k">%s</div><div style="font-family:Poppins,sans-serif;font-weight:600;font-size:20px;line-height:1.25;color:#f1f5f9">%s</div>'
              '<div style="font-size:16px;line-height:1.5;color:#cbd5e1">%s</div>%s'
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px"><a href="Phone-Home.dc.html" class="link">Skip tour</a><a href="%s" class="btn">%s</a></div></div></div>'
              % (bubble_pos, tail_style, step, title, body, extra, next_href, next_label))
    return inner

# ---------------------------------------------------------------- boards
boards = {}
notes = {}
layout = {}

def add(name, title, html, w, h, x, y, interactive=False, btitle=None):
    boards[name] = html
    e = {'x': x, 'y': y, 'w': w, 'h': h, 'title': btitle or title}
    if interactive: e['is_interactive'] = True
    layout[name] = e

# ---- Row 2: getting in -------------------------------------------------
Y2 = 1280
X = lambda i: i * 470

add('Login.dc.html', 'Sign in', page('Sign in', phone(
    '<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding:40px 28px;text-align:center">'
    '<svg viewBox="0 0 200 120" width="260" height="156" aria-hidden="true" style="overflow:visible"><path d="M20 106H180" style="stroke:#2c3a54;stroke-width:2;stroke-linecap:round"></path><g transform="translate(58 10)">' + bird('p-hello', 96) + '</g></svg>'
    '<div style="display:flex;flex-direction:column;gap:10px"><div style="font-family:Poppins,sans-serif;font-weight:700;font-size:40px;color:#f1f5f9;letter-spacing:-1px;line-height:1">Bower</div>'
    '<p style="margin:0;font-size:17px;line-height:1.5;color:#9fabbf">Your notes, kept tidy, in your own Google Drive.</p></div>'
    '<div style="display:flex;flex-direction:column;gap:10px;width:100%;margin-top:8px"><a href="Onb-Welcome.dc.html" class="btn" style="min-height:48px">'
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.7h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-7.1z" fill="#111a2b"></path><path d="M12 21c2.6 0 4.8-.9 6.3-2.3l-3.1-2.4c-.9.6-2 .9-3.2.9-2.5 0-4.6-1.7-5.3-3.9H3.5v2.5A9 9 0 0 0 12 21z" fill="#111a2b" opacity=".7"></path><path d="M6.7 13.3a5.4 5.4 0 0 1 0-3.4V7.4H3.5a9 9 0 0 0 0 8.1l3.2-2.2z" fill="#111a2b" opacity=".5"></path><path d="M12 6.6c1.4 0 2.7.5 3.7 1.4l2.7-2.7A9 9 0 0 0 3.5 7.4l3.2 2.5C7.4 7.7 9.5 6.6 12 6.6z" fill="#111a2b" opacity=".85"></path></svg>Sign in with Google</a>'
    '<p style="margin:0;font-size:13px;line-height:1.5;color:#7d8aa3">Only people the person running this Bower has invited can sign in. Bower reads and writes one folder in your Drive and nothing else.</p></div>'
    '<div style="margin-top:auto;display:flex;align-items:center;gap:6px;font-size:14px"><a href="Phone-Privacy.dc.html" class="link" style="color:#8fe0d2;font-size:14px">Privacy</a><span style="color:#3b4a66">·</span><a href="Phone-Privacy.dc.html" class="link" style="color:#8fe0d2;font-size:14px">Terms</a><span style="color:#3b4a66">·</span><a href="Intro-1.dc.html" class="link" style="color:#8fe0d2;font-size:14px">What is Bower?</a></div></div>'), 390, 844), 390, 844, X(0), Y2, True, 'Sign in')

add('Not-Invited.dc.html', 'Not invited', page('Not invited yet', phone(
    '<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:40px 28px;text-align:center">'
    + bird('p-confused', 120) +
    '<div style="display:flex;flex-direction:column;gap:10px"><h1 class="h1" style="font-size:26px">This Bower isn\'t open to you yet</h1>'
    '<p style="margin:0;font-size:16px;line-height:1.5;color:#9fabbf">You signed in as <span style="color:#dfe5ee">you@example.com</span>, but that address isn\'t on the invite list. Ask the person who runs this Bower to add you, then sign in again.</p></div>'
    '<div style="display:flex;flex-direction:column;gap:10px;width:100%"><a href="Login.dc.html" class="btn">Try another account</a><a href="Login.dc.html" class="link" style="justify-content:center">Sign out</a></div></div>'), 390, 844), 390, 844, X(1), Y2, True, 'Not invited')

add('Onb-Welcome.dc.html', 'Welcome', page('First run, welcome', phone(
    '<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;padding:40px 28px 48px;text-align:center">'
    '<svg viewBox="0 0 200 120" width="260" height="156" aria-hidden="true" style="overflow:visible"><path d="M20 106H180" style="stroke:#2c3a54;stroke-width:2;stroke-linecap:round"></path><g transform="translate(58 10)">' + bird('p-hello', 96) + '</g></svg>'
    '<div style="display:flex;flex-direction:column;gap:12px"><h1 class="h1" style="font-size:32px">Hi, I\'m Bower.</h1>'
    '<p style="margin:0;font-size:17px;line-height:1.5;color:#9fabbf">I keep your notes tidy, in a folder in your own Google Drive. Nothing leaves your account. Want a quick look around?</p></div>'
    '<div style="display:flex;flex-direction:column;gap:10px;width:100%;margin-top:8px"><a href="Onb-Folder.dc.html" class="btn" style="min-height:48px">Show me around</a><a href="Onb-Folder.dc.html" class="link" style="justify-content:center">Skip the tour</a></div>'
    '<div class="dots" style="margin-top:auto"><span class="on"></span><span></span><span></span><span></span><span></span><span></span></div></div>'), 390, 844), 390, 844, X(2), Y2, True, '1 · Welcome')

add('Onb-Folder.dc.html', 'Where your notes live', page('First run, choose a folder', phone(
    '<div style="flex-grow:1;display:flex;flex-direction:column;gap:20px;padding:56px 24px 40px">'
    '<div style="display:flex;align-items:flex-end;gap:10px">' + bird('p-idle', 64) + '<div style="padding:10px 14px;border-radius:14px;border-bottom-left-radius:4px;background:#1a2538;border:1px solid #2c3a54;font-size:15px;line-height:1.4">Where should I build the nest?</div></div>'
    '<h1 class="h1" style="font-size:26px">Where your notes live</h1>'
    '<a href="Onb-Building.dc.html" class="card" style="display:flex;gap:14px;text-decoration:none;color:#dfe5ee;border-color:#5fcfbc;background:rgba(95,207,188,.08)">' + ico('drive', 'color:#5fcfbc;width:26px;height:26px') +
    '<span style="display:flex;flex-direction:column;gap:4px"><span style="font-size:17px;font-weight:600">Make a new Bower folder</span><span style="font-size:14px;line-height:1.45;color:#9fabbf">A folder called Bower in your Drive, with six folders and a rulebook inside. Recommended.</span></span></a>'
    '<a href="#top" class="card" style="display:flex;gap:14px;text-decoration:none;color:#dfe5ee">' + ico('folder', 'color:#9fabbf;width:26px;height:26px') +
    '<span style="display:flex;flex-direction:column;gap:4px"><span style="font-size:17px;font-weight:600">Use a folder I already have</span><span style="font-size:14px;line-height:1.45;color:#9fabbf">Paste a Drive folder link. I add what is missing and never overwrite what is there.</span></span></a>'
    '<div class="field"><label for="folder">Folder link (only if you chose the second option)</label><input id="folder" type="url" placeholder="https://drive.google.com/drive/folders/FOLDER_ID"></div>'
    '<p style="margin:0;font-size:13px;line-height:1.5;color:#7d8aa3">You can move the folder later; Bower keeps its id, not its place.</p>'
    '<div class="dots" style="margin-top:auto"><span></span><span class="on"></span><span></span><span></span><span></span><span></span></div></div>'), 390, 844), 390, 844, X(3), Y2, True, '2 · Choose folder')

add('Onb-Building.dc.html', 'Building your bower', page('First run, building your folder', phone(
    '<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;gap:24px;padding:72px 28px 40px;text-align:center">'
    '<svg viewBox="0 0 220 130" width="300" height="177" aria-hidden="true" style="overflow:visible"><path d="M10 118H210" style="stroke:#2c3a54;stroke-width:2;stroke-linecap:round"></path>'
    '<g transform="translate(60 22)">' + bird('p-build', 96, scene=True) + '</g></svg>'
    '<div style="display:flex;flex-direction:column;gap:10px"><h1 class="h1" style="font-size:28px">Building your bower</h1><p style="margin:0;font-size:16px;line-height:1.5;color:#9fabbf">A folder called Bower in your Drive, six folders inside, and a rulebook you can edit. Takes a few seconds.</p></div>'
    '<div style="width:100%;height:6px;border-radius:3px;background:#1a2538;overflow:hidden"><div class="fill"></div></div>'
    '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:320px">' + ''.join('<span class="chp c%d">%s%s</span>' % (i, ico(ic, 'width:16px;height:16px;color:#9fabbf'), n) for i, (ic, n) in enumerate([('inbox', '0-Inbox'), ('folder', '1-Projects'), ('folder', '2-Areas'), ('folder', '3-Resources'), ('folder', '4-Archive'), ('chat', 'Answers')])) + '</div>'
    '<div style="margin-top:auto;display:flex;flex-direction:column;gap:14px;align-items:center;width:100%"><a href="Onb-Add.dc.html" class="btn2" style="width:100%">Continue</a>'
    '<div class="dots"><span></span><span></span><span class="on"></span><span></span><span></span><span></span></div></div></div>'), 390, 844,
    extra_css='.fill{height:100%;border-radius:3px;background:#5fcfbc;animation:grow 7.2s linear infinite}@keyframes grow{0%{width:4%}92%,100%{width:100%}}'
              '.chp{display:inline-flex;align-items:center;gap:8px;min-height:36px;padding:0 12px;border-radius:999px;background:#1a2538;border:1px solid #2c3a54;font-size:14px;color:#dfe5ee;opacity:0;animation:chip 7.2s ease-out infinite}'
              + ''.join('.c%d{animation-delay:%.1fs}' % (i, i * 1.2) for i in range(6)) +
              '@keyframes chip{0%,10%{opacity:0;transform:translateY(6px)}16%,94%{opacity:1;transform:translateY(0)}100%{opacity:0}}'), 390, 844, X(4), Y2, True, '3 · Building')

add('Onb-Add.dc.html', 'Tour: Add', page('Tour, step 1, Add', coach('1 of 3 · Add', 'Drop anything here.',
    'Photos, PDFs, links, screenshots, voice memos. You can also share to Bower from any app. I read all of it.',
    bird('p-shiny', 64, 'position:absolute;left:104px;bottom:84px'), 'bottom:160px', 'left:116px;bottom:-9px;border-right:1px solid #2c3a54;border-bottom:1px solid #2c3a54',
    nav_active='Add', next_href='Onb-Tidy.dc.html'), 390, 844), 390, 844, X(5), Y2, True, '4 · Tour: Add')

TIDY_SCENE = ('<div style="position:relative;height:140px;border-radius:12px;background:#111a2b;overflow:hidden">'
    '<div style="position:absolute;left:20px;right:20px;bottom:30px;height:2px;background:#2c3a54"></div>'
    '<div style="position:absolute;left:28px;bottom:10px;font-size:11px;color:#7d8aa3;letter-spacing:.04em">Inbox</div>'
    '<div style="position:absolute;right:22px;bottom:10px;font-size:11px;color:#7d8aa3;letter-spacing:.04em">Cooking · Finance</div>'
    '<div style="position:absolute;left:50%;bottom:20px;transform:translateX(-50%)">' + bird('p-tidy', 86, scene=True) + '</div></div>')

add('Onb-Tidy.dc.html', 'Tour: Tidy up', page('Tour, step 2, Tidy up', coach('2 of 3 · Tidy up', 'When you\'re ready, tap Tidy up.',
    'Nothing happens until you tap; there is no schedule. Add a pile first: I do better work with ten things than with one. Then I carry each one from your inbox to the right folder, give it a title and tags, and leave a note about what I did.',
    '', 'top:150px', 'right:50px;top:-9px;border-left:1px solid #2c3a54;border-top:1px solid #2c3a54',
    highlight_top='<header style="position:absolute;left:0;right:0;top:0;display:flex;align-items:center;min-height:60px;padding:8px 16px 0"><span style="flex-grow:1"></span><button type="button" class="pill ring" style="outline:2px solid #8fe0d2;outline-offset:3px">Tidy up (3)</button></header>',
    next_href='Onb-Tell.dc.html', extra=TIDY_SCENE), 390, 844), 390, 844, X(6), Y2, True, '5 · Tour: Tidy up')

add('Onb-Tell.dc.html', 'Tour: Tell', page('Tour, step 3, Tell Bower', coach('3 of 3 · Tell Bower', 'Talk to me like a person.',
    'Give me a rule, a task or a question. I remember rules for good and answer questions in a note under Answers.',
    bird('p-sing', 64, 'position:absolute;left:196px;bottom:84px'), 'bottom:160px', 'left:212px;bottom:-9px;border-right:1px solid #2c3a54;border-bottom:1px solid #2c3a54',
    nav_active='Tell', next_href='Phone-Home.dc.html', next_label='Let\'s go',
    extra='<div style="display:flex;flex-direction:column;gap:6px"><div class="ex"><span style="color:#8fe0d2;font-weight:600">Rule</span>File every receipt under Finance.</div><div class="ex"><span style="color:#8fe0d2;font-weight:600">Ask</span>What did I save about Lisbon?</div></div><div style="font-size:13px;color:#7d8aa3">Replay any time from Settings › Show me around.</div>'), 390, 844,
    extra_css='.ex{display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:10px;background:#111a2b;border:1px solid #2c3a54;font-size:14px;color:#cbd5e1}'), 390, 844, X(7), Y2, True, '6 · Tour: Tell')

# ---- Row 3: every day ----------------------------------------------------
Y3 = 2504

add('Phone-Home.dc.html', 'Home', page('Bower home, phone', phone(HOME_TOP + home_body(), 'Home'), 390, 844), 390, 844, X(0), Y3, True, 'Home')

add('Phone-Switcher.dc.html', 'Quick switcher', page('Quick switcher',
    '<div style="width:390px;height:844px;box-sizing:border-box;position:relative;background:#111a2b;overflow:hidden">' + dim_home('.55') +
    '<div style="position:absolute;left:12px;right:12px;top:96px;display:flex;flex-direction:column;border-radius:16px;background:#141d30;border:1px solid #2c3a54;box-shadow:0 16px 48px rgba(0,0,0,.5)">'
    + bird('p-shiny flip', 72, 'position:absolute;right:52px;top:-64px') +
    '<div style="display:flex;align-items:center;gap:10px;min-height:56px;padding:0 8px 0 16px;border-bottom:1px solid #2c3a54;position:relative">' + ico('search', 'color:#9fabbf') +
    '<label for="q" style="position:absolute;left:-9999px">Search or jump to a note</label><div style="flex-grow:1;display:flex;align-items:center;gap:1px;font-size:17px;color:#f1f5f9;position:relative"><input id="q" type="text" value="sour" style="width:44px;padding:0;border:none;background:transparent;color:#f1f5f9;font:17px \'Source Sans 3\',sans-serif;outline:none"><span class="caret"></span>'
    '<svg class="spk" viewBox="0 0 24 24" aria-hidden="true" style="left:52px;top:-4px"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z"></path></svg><svg class="spk s2" viewBox="0 0 24 24" aria-hidden="true" style="left:66px;top:14px;width:10px;height:10px"><path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4z"></path></svg></div>' + iconbtn('x', 'Close') + '</div>'
    '<div style="display:flex;flex-direction:column;padding:4px 4px 8px"><div class="k" style="padding:12px 12px 4px">Notes</div>'
    '<a class="res" href="Phone-Note.dc.html" style="background:#233049">' + ico('note', 'color:#9fabbf') + '<span style="display:flex;flex-direction:column;gap:2px;min-width:0;flex-grow:1"><span style="font-size:16px"><span style="color:#8fe0d2;font-weight:600">Sour</span>dough starter</span><span style="font-size:13px;color:#9fabbf">2-Areas / Cooking</span></span><span class="kbd">Enter</span></a>'
    '<a class="res" href="Phone-Note.dc.html">' + ico('note', 'color:#9fabbf') + '<span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:16px">Weeknight curry</span><span style="font-size:13px;color:#9fabbf">…serve with <span style="color:#8fe0d2">sour</span>dough flatbread</span></span></a>'
    '<a class="res" href="Phone-Note.dc.html">' + ico('note', 'color:#9fabbf') + '<span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:16px">Shopping list</span><span style="font-size:13px;color:#9fabbf">rye flour for the <span style="color:#8fe0d2">sour</span>dough</span></span></a>'
    '<div class="k" style="padding:12px 12px 4px">Commands</div>'
    '<a class="res" href="Phone-Working.dc.html">' + ico('inbox', 'color:#9fabbf') + '<span style="flex-grow:1;font-size:16px">Tidy up the inbox</span><span style="font-size:13px;color:#9fabbf">3 waiting</span></a>'
    '<a class="res" href="Phone-Add.dc.html">' + ico('plus', 'color:#9fabbf') + '<span style="flex-grow:1;font-size:16px">Add a file or photo</span></a>'
    '<a class="res" href="Phone-Tell.dc.html">' + ico('chat', 'color:#9fabbf') + '<span style="flex-grow:1;font-size:16px">Tell Bower something</span></a>'
    '<a class="res" href="Phone-Settings.dc.html">' + ico('sun', 'color:#9fabbf') + '<span style="flex-grow:1;font-size:16px">Switch to light theme</span></a></div></div></div>', 390, 844,
    extra_css='.res{display:flex;align-items:center;gap:12px;min-height:52px;padding:0 12px;border-radius:10px;text-decoration:none;color:#dfe5ee}.res:hover{background:#233049}'
              '.caret{display:inline-block;width:2px;height:20px;background:#5fcfbc;animation:caret 1s steps(2) infinite}@keyframes caret{to{opacity:0}}'
              '.spk{position:absolute;width:14px;height:14px;fill:#f0b64f;animation:twinkle 1s ease-in-out infinite}.s2{animation-delay:.5s}'), 390, 844, X(1), Y3, True, 'Quick switcher')

add('Phone-Note.dc.html', 'Note', page('Note, phone', phone(
    topbar(backlink('Cooking', 'Phone-Folder.dc.html'), PILL + '<a href="Phone-Note-Menu.dc.html" aria-label="More" style="width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;color:#9fabbf">' + ico('more') + '</a>') +
    '<article style="flex-grow:1;overflow:hidden;padding:8px 20px 0;display:flex;flex-direction:column">'
    '<h1 class="h1" style="font-size:28px;margin-bottom:12px">Sourdough starter</h1>'
    '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:18px;font-size:13px;color:#9fabbf"><a class="tag" href="#top">#recipe</a><a class="tag" href="#top">#bread</a><span style="display:inline-flex;align-items:center;gap:4px">' + ico('cal', 'width:14px;height:14px') + '12 Sep</span><span style="display:inline-flex;align-items:center;gap:4px">' + ico('link', 'width:14px;height:14px') + 'Clipping</span></div>'
    '<div class="prose"><p>A starter is flour and water that you feed until wild yeast moves in. Mine took nine days. Keep the jar somewhere warm and away from the window.</p>'
    '<div style="display:flex;gap:10px;padding:12px 14px;margin:0 0 16px;border-radius:12px;background:rgba(95,207,188,.1);border-left:3px solid #5fcfbc">' + bird('p-idle', 28) + '<div style="font-size:14px;line-height:1.5;color:#cbd5e1"><span style="font-weight:600;color:#8fe0d2">Bower\'s note.</span> Filed from a clipping. Linked to <a class="wl" href="#top">Flour types</a>.</div></div>'
    '<h2>Feeding schedule</h2><ul style="margin:0 0 14px;padding-left:22px"><li>Days 1 to 3: 50 g <a class="wl" href="#top">rye flour</a>, 50 g water, once a day.</li><li>Days 4 to 9: bread flour, twice a day.</li><li>Ready when it doubles within six hours.</li></ul>'
    '<h2>Troubleshooting</h2><p>Grey liquid on top means hungry, not dead. Pour it off and feed. Pink means start over.</p></div>'
    '<div style="margin-top:auto;padding-top:12px;display:flex;flex-direction:column;gap:10px"><div class="k">Linked mentions · 2</div>'
    '<a href="#top" class="card" style="display:flex;flex-direction:column;gap:3px;padding:10px 12px;text-decoration:none"><span style="font-size:14px;font-weight:600;color:#f1f5f9">Weeknight curry</span><span style="font-size:13px;color:#9fabbf;line-height:1.4">…flatbread from the <span style="color:#8fe0d2">[[Sourdough starter]]</span> discard.</span></a>'
    '<nav aria-label="Notes in this folder" style="display:flex;justify-content:space-between;gap:12px;padding:6px 0 10px;font-size:14px"><a href="#top" class="link" style="gap:4px;min-height:36px">' + ico('back', 'width:16px;height:16px') + 'Flour types</a><a href="#top" class="link" style="gap:4px;min-height:36px">Weeknight curry' + ico('next', 'width:16px;height:16px') + '</a></nav></div></article>', 'Home'), 390, 844), 390, 844, X(2), Y3, True, 'Note')

add('Phone-Add.dc.html', 'Add', page('Add, phone', phone(
    title_top('Add') +
    '<div style="flex-grow:1;overflow:hidden;padding:8px 16px 0;display:flex;flex-direction:column;gap:16px">'
    '<div style="position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:190px;padding:24px 16px 20px;border-radius:16px;border:2px dashed #3b4a66;background:#141d30;overflow:hidden">'
    '<div style="position:absolute;left:0;right:0;top:0;height:52px;display:flex;justify-content:center;overflow:hidden">' + bird('p-peek', 72, 'margin-top:14px') + '</div>'
    '<div style="margin-top:44px;font-family:Poppins,sans-serif;font-weight:600;font-size:18px;color:#f1f5f9">Drop anything here</div><div style="font-size:14px;color:#9fabbf;text-align:center;line-height:1.45">Photos, PDFs, screenshots, voice memos, links. Or share to Bower from any app.</div>'
    '<div style="display:flex;gap:10px;margin-top:6px"><button type="button" class="btn">' + ico('file', 'width:18px;height:18px') + 'Choose files</button><button type="button" class="btn2">' + ico('camera', 'width:18px;height:18px') + 'Photo</button></div></div>'
    '<div class="field"><label for="lnk">Or paste a link</label><div style="display:flex;gap:8px"><input id="lnk" type="url" placeholder="https://" style="flex-grow:1"><button type="button" class="btn2" style="min-height:44px">Save</button></div></div>'
    '<div style="display:flex;flex-direction:column;gap:8px"><div class="k">Adding · 2 of 3</div>'
    '<div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 12px">' + ico('check', 'color:#7ed3a1') + '<span style="flex-grow:1;display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:15px;font-weight:600">receipt-hardware-store.jpg</span><span style="font-size:13px;color:#9fabbf">Added to your inbox</span></span></div>'
    '<div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 12px">' + bird('p-fly', 30) + '<span style="flex-grow:1;display:flex;flex-direction:column;gap:6px;min-width:0"><span style="font-size:15px;font-weight:600">Lease agreement 2026.pdf</span><span style="height:4px;border-radius:2px;background:#2c3a54;overflow:hidden;display:block"><span style="display:block;width:62%;height:100%;background:#5fcfbc"></span></span></span><span style="font-size:13px;color:#9fabbf">62%</span></div>'
    '<div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 12px;opacity:.7">' + ico('file', 'color:#9fabbf') + '<span style="flex-grow:1;display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:15px;font-weight:600">Voice memo 14.m4a</span><span style="font-size:13px;color:#9fabbf">Waiting</span></span></div></div>'
    '<div class="card" style="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;background:rgba(240,182,79,.08);border-color:rgba(240,182,79,.35)">' + ico('inbox', 'color:#f0b64f') + '<div style="font-size:14px;line-height:1.45;color:#cbd5e1"><b style="color:#f1f5f9">This only fills your inbox.</b> Add as much as you like, then tap Tidy up once: Bower does better work with a pile than with one thing at a time.</div></div></div>', 'Add'), 390, 844), 390, 844, X(3), Y3, True, 'Add')

add('Phone-Tell.dc.html', 'Tell Bower', page('Tell Bower, phone', phone(
    title_top('Tell Bower', iconbtn('clock', 'Sent history')) +
    '<div style="flex-grow:1;overflow:hidden;padding:12px 16px 0;display:flex;flex-direction:column;gap:12px">'
    '<div style="display:flex;align-items:flex-end;gap:8px">' + bird('p-idle e-happy', 44) + '<div class="bw">A rule, a task or a question. I\'ll put it in your inbox and get to it on the next tidy-up.</div></div>'
    '<div class="me">From now on, file recipes under Cooking and tag them #recipe</div><div class="meta">' + ico('check', 'width:14px;height:14px;color:#7ed3a1') + 'Rule kept · Sep 26, 14:05</div>'
    '<div class="me">What did I save about trip planning last month?</div><div class="meta">' + ico('check', 'width:14px;height:14px;color:#7ed3a1') + 'Answered · Sep 26, 14:12</div>'
    '<div style="display:flex;align-items:flex-end;gap:8px">' + bird('p-idle', 44) + '<div class="bw">Two notes and a clipping. I put them together in <a href="Phone-Note.dc.html" class="wl">Answers / Trip planning</a>.</div></div>'
    '<div class="me">Summarise the PDF I added today in three bullet points</div><div class="meta">' + bird('p-fly', 22) + 'Tidying up…</div>'
    '<div style="display:flex;align-items:flex-end;gap:8px;margin-top:auto;padding-bottom:4px">' + bird('p-sing', 64) + '<div style="font-size:13px;color:#9fabbf;line-height:1.4;padding-bottom:6px">Sings while you type. Quiet again when you stop.</div></div></div>'
    '<div style="display:flex;flex-direction:column;gap:10px;padding:10px 16px 12px;border-top:1px solid #2c3a54"><div style="display:flex;gap:8px"><button type="button" class="chip">A rule</button><button type="button" class="chip">A task</button><button type="button" class="chip">A question</button></div>'
    '<div style="display:flex;align-items:flex-end;gap:8px"><label for="msg" style="position:absolute;left:-9999px">Message</label><textarea id="msg" placeholder="For example: file every receipt under Finance" style="flex-grow:1;min-height:48px;max-height:120px;padding:12px 14px;border-radius:14px;border:1px solid #5fcfbc;background:#1a2538;color:#dfe5ee;font:15px/1.4 \'Source Sans 3\',sans-serif;resize:none">Remind me to</textarea>'
    '<button type="button" aria-label="Send" class="btn" style="width:48px;height:48px;padding:0;border-radius:14px">' + ico('send') + '</button></div></div>', 'Tell'), 390, 844,
    extra_css='.me{align-self:flex-end;max-width:290px;padding:10px 14px;border-radius:16px;border-bottom-right-radius:4px;background:#5fcfbc;color:#0b1220;font-size:15px;line-height:1.4}'
              '.bw{align-self:flex-start;max-width:280px;padding:10px 14px;border-radius:16px;border-bottom-left-radius:4px;background:#1a2538;border:1px solid #2c3a54;color:#dfe5ee;font-size:15px;line-height:1.4}'
              '.meta{align-self:flex-end;display:flex;align-items:center;gap:6px;font-size:12px;color:#9fabbf;margin-top:-6px}'), 390, 844, X(4), Y3, True, 'Tell Bower')

add('Phone-Working.dc.html', 'Tidying up', page('Tidying up, the sheet',
    '<div style="width:390px;height:844px;box-sizing:border-box;position:relative;background:#111a2b;overflow:hidden">' + dim_home('.6') +
    '<header style="position:absolute;left:0;right:0;top:0;display:flex;align-items:center;min-height:60px;padding:8px 16px 0"><span style="flex-grow:1"></span><button type="button" class="pill" style="background:#1a2538;color:#dfe5ee;border:1px solid #5fcfbc">' + bird('p-fly', 22) + 'Tidying up…</button></header>'
    '<div style="position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:14px;padding:20px 20px 36px;border-radius:20px 20px 0 0;background:#1a2538;border-top:1px solid #2c3a54;box-shadow:0 -16px 48px rgba(0,0,0,.5)">'
    '<div style="display:flex;align-items:center;justify-content:space-between"><div style="font-family:Poppins,sans-serif;font-weight:600;font-size:20px;color:#f1f5f9">Tidying up</div>' + iconbtn('x', 'Close') + '</div>'
    '<div style="position:relative;height:170px;border-radius:14px;background:#111a2b;overflow:hidden"><div style="position:absolute;left:24px;right:24px;bottom:40px;height:2px;background:#2c3a54"></div>'
    '<div style="position:absolute;left:34px;bottom:16px;font-size:12px;color:#7d8aa3">Inbox</div><div style="position:absolute;right:26px;bottom:16px;font-size:12px;color:#7d8aa3">Cooking · Finance · Answers</div>'
    '<div style="position:absolute;left:50%;bottom:30px;transform:translateX(-50%)">' + bird('p-tidy', 104, scene=True) + '</div></div>'
    '<div style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;align-items:center;justify-content:space-between;font-size:15px"><span>2 of 3 filed</span><span class="muted">Started 1 min ago</span></div>'
    '<div style="height:6px;border-radius:3px;background:#111a2b;overflow:hidden"><div style="width:66%;height:100%;background:#5fcfbc"></div></div>'
    '<div style="font-size:14px;line-height:1.5;color:#9fabbf">Usually takes three to five minutes. You can close this; I\'ll ping you when I\'m done.</div></div>'
    '<div style="display:flex;flex-direction:column;gap:6px"><div class="card" style="display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:14px">' + ico('check', 'width:18px;height:18px;color:#7ed3a1') + '<span style="flex-grow:1">receipt-hardware-store.jpg</span><span class="muted">→ Finance</span></div>'
    '<div class="card" style="display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:14px">' + ico('check', 'width:18px;height:18px;color:#7ed3a1') + '<span style="flex-grow:1">Lease agreement 2026.pdf</span><span class="muted">→ Home</span></div>'
    '<div class="card" style="display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:14px;opacity:.7">' + bird('p-fly', 18) + '<span style="flex-grow:1">Voice memo 14.m4a</span><span class="muted">reading…</span></div></div></div></div>', 390, 844), 390, 844, X(5), Y3, False, 'Tidying up (sheet)')

add('Phone-Offline.dc.html', 'Offline', page('Home, offline', phone(
    topbar(MENU + BRAND, '<button type="button" class="pill" disabled style="opacity:.5">Tidy up (3)</button>') +
    '<div style="display:flex;align-items:center;gap:10px;margin:0 16px;padding:10px 14px;border-radius:12px;background:#1a2538;border:1px solid #2c3a54;font-size:14px;color:#cbd5e1">' + ico('wifi', 'color:#9fabbf') + '<span style="flex-grow:1;line-height:1.4">You\'re offline. Showing the notes saved on this phone; adding and tidying up will wait.</span></div>'
    + home_body().replace('Three new things in your inbox. Shall I tidy up?', 'No signal here. I\'ll keep an eye out.').replace(bird('p-look', 88, 'margin-bottom:-8px'), bird('p-offline', 88, 'margin-bottom:-8px')), 'Home'), 390, 844), 390, 844, X(6), Y3, False, 'Home · offline')

add('Phone-Done.dc.html', 'Done', page('Home, run finished', phone(
    topbar(MENU + BRAND, '<button type="button" class="pill" style="background:#7ed3a1">Done ✓</button>') +
    home_body().replace(bird('p-look', 88, 'margin-bottom:-8px'), bird('p-dance', 88, 'margin-bottom:-8px')).replace('Three new things in your inbox. Shall I tidy up?', 'All tidy. Three things filed, one answer written.').replace('<div style="font-family:Poppins,sans-serif;font-weight:700;font-size:34px;line-height:1">3</div><div style="font-size:13px;color:#9fabbf">waiting to be tidied</div>', '<div style="font-family:Poppins,sans-serif;font-weight:700;font-size:34px;line-height:1">0</div><div style="font-size:13px;color:#9fabbf">nothing waiting</div>') +
    '<div style="position:absolute;left:16px;right:16px;bottom:98px;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:#1a2538;border:1px solid #7ed3a1;box-shadow:0 12px 32px rgba(0,0,0,.5)">' + ico('check', 'color:#7ed3a1') + '<span style="flex-grow:1;font-size:15px;line-height:1.4">Filed 3 things and wrote 1 answer.</span><a href="Phone-Note.dc.html" style="color:#8fe0d2;font-weight:600;font-size:15px;text-decoration:none">See</a></div>', 'Home').replace('display:flex;flex-direction:column;background:#111a2b;overflow:hidden', 'display:flex;flex-direction:column;background:#111a2b;overflow:hidden;position:relative'), 390, 844), 390, 844, X(7), Y3, False, 'Home · done')

# ---- Row 4: settings and edge states --------------------------------------
Y4 = 3728

def srow(icon, label, hint, right):
    return '<div style="display:flex;align-items:center;gap:12px;min-height:56px;padding:6px 0">' + ico(icon, 'color:#9fabbf') + '<span style="flex-grow:1;display:flex;flex-direction:column;gap:2px"><span style="font-size:16px">%s</span>%s</span>%s</div>' % (label, ('<span style="font-size:13px;color:#9fabbf">%s</span>' % hint) if hint else '', right)

add('Phone-Settings.dc.html', 'Settings', page('Settings, phone', phone(
    title_top('Settings') +
    '<div style="flex-grow:1;overflow:hidden;padding:4px 16px 0;display:flex;flex-direction:column;gap:14px">'
    '<div class="card" style="display:flex;align-items:center;gap:12px"><span aria-hidden="true" style="width:44px;height:44px;border-radius:50%;background:#233049;color:#8fe0d2;display:inline-flex;align-items:center;justify-content:center;font-family:Poppins,sans-serif;font-weight:600;font-size:18px;flex-shrink:0">A</span><div style="display:flex;flex-direction:column;gap:2px;min-width:0"><div style="font-size:16px;font-weight:600">Alex</div><div style="font-size:13px;color:#9fabbf">you@example.com</div></div><a href="#top" class="link" style="margin-left:auto;color:#8fe0d2;gap:4px">' + ico('ext', 'width:16px;height:16px') + 'Drive</a></div>'
    '<div class="card" style="display:flex;flex-direction:column;padding:4px 14px"><div class="k" style="padding:10px 0 2px">Tidying up</div>'
    + srow('bell', 'Ping me when it\'s done', 'Notifications on this phone', '<span class="tog"></span>')
    + srow('heart', 'Weekly health check', 'Every Sunday, a report under Health', '<span class="tog"></span>') + '</div>'
    '<div class="card" style="display:flex;flex-direction:column;padding:4px 14px"><div class="k" style="padding:10px 0 2px">Look</div>'
    '<div style="display:flex;gap:6px;padding:8px 0 12px"><button type="button" class="chip" style="flex:1;border-color:#5fcfbc;color:#8fe0d2">Match my phone</button><button type="button" class="chip" style="flex:1">Light</button><button type="button" class="chip" style="flex:1">Dark</button></div></div>'
    '<div class="card" style="display:flex;flex-direction:column;padding:4px 14px"><div class="k" style="padding:10px 0 2px">Advanced</div>'
    + srow('key', 'Use my own Claude API key', 'Runs on your billing, not the operator\'s', ico('next', 'color:#7d8aa3'))
    + srow('user', 'Show me around again', 'Replay the three-step tour', ico('next', 'color:#7d8aa3'))
    + srow('info', 'What is Bower', 'The four screens from the first visit', ico('next', 'color:#7d8aa3'))
    + srow('eyeoff', 'Show Bower\'s own files', 'Rulebook, catalogue, journal, instruction notes, dot-folders (.obsidian, .claude)', '<span class="tog off"></span>') + '</div>'
    '<div style="display:flex;flex-direction:column;gap:6px;margin-top:auto;padding-bottom:8px"><button type="button" class="btn2">Sign out</button><button type="button" class="link" style="justify-content:center;background:none;border:none;color:#ef8a8a;font:15px \'Source Sans 3\',sans-serif;cursor:pointer">Delete my account (your Drive folder stays)</button></div></div>', 'Settings'), 390, 844), 390, 844, X(0), Y4, False, 'Settings')

add('Phone-Health.dc.html', 'Health check', page('Health check, phone', phone(
    topbar(backlink('Home', 'Phone-Home.dc.html'), PILL + iconbtn('ext', 'Open report in Drive')) +
    '<div style="flex-grow:1;overflow:hidden;padding:4px 16px 0;display:flex;flex-direction:column;gap:14px">'
    '<div style="display:flex;align-items:flex-end;gap:8px">' + bird('p-done', 72, 'margin-bottom:-6px') + '<div style="display:flex;flex-direction:column;gap:6px"><h1 class="h1">Health check</h1><div style="padding:10px 14px;border-radius:14px;border-bottom-left-radius:4px;background:#1a2538;border:1px solid #2c3a54;font-size:15px;line-height:1.4">Sunday\'s check. Your notes are in good shape, four small things to fix.</div></div></div>'
    '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">'
    + ''.join('<div class="card" style="padding:12px;display:flex;flex-direction:column;gap:4px"><div style="font-family:Poppins,sans-serif;font-weight:700;font-size:26px;line-height:1;color:%s">%s</div><div style="font-size:12px;color:#9fabbf;line-height:1.3">%s</div></div>' % c for c in [('#f1f5f9', '184', 'notes'), ('#f0b64f', '4', 'to fix'), ('#7ed3a1', '0', 'broken links')]) + '</div>'
    '<div style="display:flex;flex-direction:column;gap:8px"><div class="k">To fix</div>'
    + ''.join('<div class="card" style="display:flex;align-items:center;gap:12px;padding:10px 12px">%s<span style="flex-grow:1;display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:15px;font-weight:600">%s</span><span style="font-size:13px;color:#9fabbf">%s</span></span></div>' % (ico(i, 'color:#f0b64f'), t, s) for i, t, s in [
        ('tag', '2 notes without tags', 'Trip to Lisbon, Car insurance renewal'), ('note', 'Duplicate: "Sourdough" and "Sourdough starter"', 'Same recipe, two notes'), ('folder', '1 note still in the inbox for 9 days', 'Voice memo 14.m4a could not be read')]) + '</div>'
    '<a href="Phone-Tell.dc.html" class="btn" style="margin-top:auto;margin-bottom:8px">Ask Bower to fix these</a></div>', 'Home'), 390, 844), 390, 844, X(1), Y4, True, 'Health check')

add('Phone-Privacy.dc.html', 'Privacy', page('Privacy, phone', phone(
    topbar(backlink('Back', 'Login.dc.html')) +
    '<div class="prose" style="flex-grow:1;overflow:hidden;padding:4px 20px 0"><h1 class="h1" style="margin-bottom:14px">Privacy</h1>'
    '<p>Your notes live in one folder in your own Google Drive. Bower reads and writes that folder and nothing else in your account.</p>'
    '<h2>What Bower keeps</h2><ul style="margin:0 0 14px;padding-left:22px"><li>Your email, to know you are invited.</li><li>An encrypted key to reach your folder.</li><li>The folder\'s id, never its contents.</li></ul>'
    '<h2>What Bower never keeps</h2><p>Copies of your notes or files. Every tidy-up works on a temporary copy that is deleted when it ends.</p>'
    '<h2>Leaving</h2><p>Delete your account from Settings. Bower forgets you at once; your Drive folder stays exactly as it is.</p></div>'), 390, 844), 390, 844, X(2), Y4, True, 'Privacy')

add('Phone-NotFound.dc.html', 'Not found', page('Note not found', phone(
    topbar(backlink('Home', 'Phone-Home.dc.html')) +
    '<div style="flex-grow:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:40px 28px;text-align:center">' + bird('p-confused', 120) +
    '<div style="display:flex;flex-direction:column;gap:10px"><h1 class="h1" style="font-size:26px">I can\'t find that note</h1><p style="margin:0;font-size:16px;line-height:1.5;color:#9fabbf">It isn\'t in your Bower folder any more. Maybe it moved, or the link is old.</p></div>'
    '<div style="display:flex;flex-direction:column;gap:10px;width:100%"><a href="Phone-Switcher.dc.html" class="btn">Search for it</a><a href="Phone-Home.dc.html" class="link" style="justify-content:center">Go home</a></div></div>', 'Home'), 390, 844), 390, 844, X(3), Y4, True, 'Not found')

add('Phone-Push.dc.html', 'Notifications', page('Push prompt',
    '<div style="width:390px;height:844px;box-sizing:border-box;position:relative;background:#111a2b;overflow:hidden">' + dim_home('.6') +
    '<div style="position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;align-items:center;gap:14px;padding:24px 24px 40px;border-radius:20px 20px 0 0;background:#1a2538;border-top:1px solid #2c3a54;text-align:center">'
    + bird('p-sing', 88) +
    '<div style="font-family:Poppins,sans-serif;font-weight:600;font-size:22px;color:#f1f5f9">Want a ping when I\'m done?</div>'
    '<div style="font-size:15px;line-height:1.5;color:#cbd5e1">Tidying up takes a few minutes. I\'ll send one short notification when everything is filed, and nothing else, ever.</div>'
    '<div style="display:flex;flex-direction:column;gap:10px;width:100%;margin-top:6px"><a href="Phone-Home.dc.html" class="btn" style="min-height:48px">Yes, ping me</a><a href="Phone-Home.dc.html" class="link" style="justify-content:center">Not now</a></div></div></div>', 390, 844), 390, 844, X(4), Y4, True, 'Notifications')

# ---- Row 1: brand and desktop ---------------------------------------------
Y1 = 0

BOWER_FILES = ('<div style="margin:10px 0 2px;padding-top:8px;border-top:1px dashed #2c3a54"></div>'
  '<a class="trow" href="#top" style="color:#9fabbf">' + ico('next', 'width:14px;height:14px;transform:rotate(90deg)') + ico('bowerfolder') + '<span style="flex-grow:1">Bower\'s files</span><span style="font-size:11px;padding:0 6px;border-radius:999px;border:1px solid #3b4a66;color:#7d8aa3">app</span></a>'
  + ''.join('<a class="trow" href="%s" style="padding-left:30px;color:#9fabbf%s">%s<span style="flex-grow:1">%s</span></a>' % (h, st, ico(i), n) for i, n, h, st in [('shield', 'Rulebook', 'Desktop-Files.dc.html', ';color:#5fcfbc;background:rgba(95,207,188,.12)'), ('note', 'Catalogue (index)', '#top', ''), ('clock', 'Journal (log)', '#top', ''), ('user', 'About me', '#top', ''), ('chat', 'Instruction notes (7)', '#top', ''), ('heart', 'Health reports (3)', '#top', '')]))

def sidebar(active, reveal=False):
    tree = [(0, 'folder', '1-Projects', '4', False), (0, 'folder', '2-Areas', '12', True), (1, 'folder', 'Cooking', '', True), (2, 'note', 'Flour types', '', False), (2, 'note', 'Sourdough starter', '', None), (2, 'note', 'Weeknight curry', '', False), (1, 'folder', 'Finance', '', False), (1, 'folder', 'Home', '', False), (0, 'folder', '3-Resources', '9', False), (0, 'folder', '4-Archive', '', False), (0, 'folder', 'Answers', '6', False)]
    rows = ''
    for depth, kind, name, count, state in tree:
        chev = '' if kind == 'note' else ico('next', 'width:14px;height:14px' + (';transform:rotate(90deg)' if state else ''))
        cur = ' style="padding-left:%dpx;color:#5fcfbc;background:rgba(95,207,188,.12)"' % (8 + depth * 22) if state is None and active == 'note' else ' style="padding-left:%dpx"' % (8 + depth * 22)
        pin = ('<button type="button" aria-label="Pin to Home" class="tbtn" style="width:24px;height:24px">' + ico('pin', 'width:14px;height:14px') + '</button>') if state is None and active == 'note' else ''
        rows += '<a class="trow" href="#top"%s>%s%s<span style="flex-grow:1">%s</span>%s%s</a>' % (cur, chev, ico(kind), name, ('<span style="font-size:12px;color:#7d8aa3">%s</span>' % count) if count else '', pin)
    def nav(label, icon, badge='', href='#top'):
        on = ' style="background:#233049;color:#f1f5f9"' if label == active else ''
        b = ('<span style="padding:0 8px;border-radius:999px;background:#f0b64f;color:#111a2b;font-size:12px;font-weight:600;line-height:20px">%s</span>' % badge) if badge else ''
        return '<a class="nav" href="%s"%s>%s<span style="flex-grow:1">%s</span>%s</a>' % (href, on, ico(icon, 'width:18px;height:18px'), label, b)
    return ('<nav aria-label="Primary" style="display:flex;flex-direction:column;gap:6px;padding:16px 12px;background:#0b1120;border-right:1px solid #2c3a54;min-height:0">'
            '<a href="Desktop-Home.dc.html" aria-label="Bower home" style="display:flex;align-items:center;gap:10px;padding:4px 10px 12px;text-decoration:none">' + '<span style="font-family:Poppins,sans-serif;font-weight:700;font-size:20px;color:#f1f5f9">Bower</span></a>'
            '<button type="button" style="display:flex;align-items:center;gap:10px;min-height:38px;padding:0 12px;border-radius:10px;background:#1a2538;border:1px solid #2c3a54;color:#7d8aa3;font:15px \'Source Sans 3\',sans-serif;cursor:pointer;text-align:left">' + ico('search', 'width:18px;height:18px') + '<span style="flex-grow:1">Search or jump to</span><span class="kbd">Ctrl K</span></button><div style="height:6px"></div>'
            + nav('Home', 'home', href='Desktop-Home.dc.html') + nav('Add', 'plus') + nav('Tell Bower', 'chat') + nav('Health', 'heart', 'New') +
            '<div style="display:flex;align-items:center;margin:14px 6px 2px 10px"><span class="k" style="flex-grow:1">Pinned</span></div>'
            + ''.join('<a class="trow" href="%s">%s<span style="flex-grow:1">%s</span></a>' % (h, ico(i, 'color:' + ('#f0b64f' if i == 'folder' else '#9fabbf')), n) for i, n, m, h in PIN_ITEMS[:3]) +
            '<div style="display:flex;align-items:center;margin:18px 6px 4px 10px"><span class="k" style="flex-grow:1">Your notes</span><button type="button" aria-label="Sort" class="tbtn">' + ico('sort', 'width:16px;height:16px') + '</button><button type="button" aria-label="Collapse all" class="tbtn">' + ico('collapse', 'width:16px;height:16px') + '</button></div>'
            '<div style="display:flex;flex-direction:column;gap:2px;flex-grow:1;min-height:0;overflow:hidden">' + rows + (BOWER_FILES if reveal else '') + '</div>'
            + ('<button type="button" class="trow" style="color:#7d8aa3;font-size:13px;margin-top:4px;background:none;border:none;cursor:pointer;font-family:inherit">' + ico('eye', 'width:16px;height:16px') + '<span style="flex-grow:1;text-align:left">Own files and dot-folders: shown</span></button>' if reveal else
               '<button type="button" class="trow" style="color:#7d8aa3;font-size:13px;margin-top:4px;background:none;border:none;cursor:pointer;font-family:inherit">' + ico('eyeoff', 'width:16px;height:16px') + '<span style="flex-grow:1;text-align:left">Own files and dot-folders: hidden</span></button>')
            + '<div style="font-size:12px;color:#7d8aa3;padding:4px 10px 0">Last tidy-up 2 hours ago</div>'
            '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px 0;font-size:12px;color:#7d8aa3"><span>you@example.com</span><button type="button" style="background:none;border:none;color:#9fabbf;font:12px \'Source Sans 3\',sans-serif;cursor:pointer;text-decoration:underline">Sign out</button></div></nav>')

DESK_CSS = ('.tbtn{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:transparent;color:#7d8aa3;cursor:pointer}.tbtn:hover{background:#233049;color:#dfe5ee}'
            '.nav{display:flex;align-items:center;gap:10px;min-height:36px;padding:0 10px;border-radius:8px;color:#cbd5e1;text-decoration:none;font-size:15px}.nav:hover{background:#233049;color:#f1f5f9}'
            '.trow{display:flex;align-items:center;gap:8px;min-height:32px;padding:0 8px;border-radius:6px;color:#cbd5e1;text-decoration:none;font-size:14px}.trow:hover{background:#233049;color:#f1f5f9}.trow .ico{width:18px;height:18px}'
            '.dp p{margin:0 0 16px;font-size:17px;line-height:1.6}.dp h2{margin:28px 0 10px;font-family:Poppins,sans-serif;font-weight:600;font-size:22px;color:#f1f5f9}.dp li{font-size:17px;line-height:1.6;margin-bottom:4px}')

def desk_top(crumb, more=False):
    return ('<div style="display:flex;align-items:center;gap:12px;min-height:56px;padding:0 24px;border-bottom:1px solid #2c3a54">' + crumb +
            '<button type="button" aria-label="Switch theme" style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:#9fabbf;cursor:pointer">' + ico('moon', 'width:18px;height:18px') + '</button>'
            '<button type="button" class="pill" style="min-height:36px;border-radius:10px">Tidy up (3)</button>' + (('<button type="button" aria-label="More" style="width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:#9fabbf;cursor:pointer">' + ico('more', 'width:18px;height:18px') + '</button>') if more else '') + '</div>')

add('Desktop-Note.dc.html', 'Desktop · reading a note', page('Desktop, reading a note',
    '<div style="width:1440px;height:900px;box-sizing:border-box;display:grid;grid-template-columns:264px minmax(0,1fr) 280px;background:#111a2b;overflow:hidden">' + sidebar('note') +
    '<main style="display:flex;flex-direction:column;min-width:0;min-height:0">' + desk_top('<nav aria-label="Folder" style="display:flex;align-items:center;gap:6px;font-size:14px;color:#9fabbf;flex-grow:1"><a href="#top" style="color:#9fabbf;text-decoration:none">2-Areas</a><span aria-hidden="true">/</span><a href="#top" style="color:#9fabbf;text-decoration:none">Cooking</a><span aria-hidden="true">/</span><span style="color:#dfe5ee">Sourdough starter</span></nav>', more=True) +
    '<article style="flex-grow:1;overflow:hidden;padding:40px 24px 0"><div style="max-width:720px;margin:0 auto;display:flex;flex-direction:column">'
    '<h1 style="margin:0 0 16px;font-family:Poppins,sans-serif;font-weight:700;font-size:36px;line-height:1.15;color:#f1f5f9;letter-spacing:-.5px">Sourdough starter</h1>'
    '<div style="display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 12px;padding:14px 16px;margin-bottom:28px;border-radius:12px;background:#1a2538;border:1px solid #2c3a54;font-size:14px">'
    '<div style="display:flex;align-items:center;gap:6px;color:#9fabbf">' + ico('tag', 'width:15px;height:15px') + 'tags</div><div style="display:flex;gap:6px"><a class="tag" href="#top">#recipe</a><a class="tag" href="#top">#bread</a></div>'
    '<div style="display:flex;align-items:center;gap:6px;color:#9fabbf">' + ico('cal', 'width:15px;height:15px') + 'created</div><div>2026-09-12</div>'
    '<div style="display:flex;align-items:center;gap:6px;color:#9fabbf">' + ico('link', 'width:15px;height:15px') + 'source</div><div>Clipping, filed by Bower</div></div>'
    '<div class="dp"><p>A starter is flour and water that you feed until wild yeast moves in. Mine took nine days. Keep the jar somewhere warm and away from the window; direct sun dries the top layer.</p>'
    '<div style="display:flex;gap:12px;padding:14px 16px;margin:0 0 20px;border-radius:12px;background:rgba(95,207,188,.1);border-left:3px solid #5fcfbc">' + bird('p-idle', 30) + '<div style="font-size:15px;line-height:1.5;color:#cbd5e1"><span style="font-weight:600;color:#8fe0d2">Bower\'s note.</span> Filed here from a clipping on 12 Sep. It links to <a class="wl" href="#top">Flour types</a> because both mention rye.</div></div>'
    '<h2>Feeding schedule</h2><ul style="margin:0 0 16px;padding-left:22px"><li>Days 1 to 3: 50 g <a class="wl" href="#top">rye flour</a>, 50 g water, once a day.</li><li>Days 4 to 9: switch to bread flour, feed twice a day.</li><li>Ready when it doubles within six hours of a feed.</li></ul>'
    '<h2>Troubleshooting</h2><p>A grey liquid on top means it is hungry, not dead. Pour it off and feed. A pink tint means throw it away and start over; see <a class="wl" href="#top">Kitchen hygiene</a>.</p></div></div></article></main>'
    '<aside aria-label="About this note" style="display:flex;flex-direction:column;gap:24px;padding:24px 20px;border-left:1px solid #2c3a54">'
    '<div><div class="k" style="margin-bottom:8px">Outline</div><div style="display:flex;flex-direction:column;gap:2px"><a class="trow" href="#top">Feeding schedule</a><a class="trow" href="#top">Troubleshooting</a></div></div>'
    '<div><div class="k" style="margin-bottom:8px">Linked mentions</div><div style="display:flex;flex-direction:column;gap:8px">'
    '<a href="#top" class="card" style="display:flex;flex-direction:column;gap:4px;padding:10px 12px;text-decoration:none"><span style="font-size:14px;font-weight:600;color:#f1f5f9">Weeknight curry</span><span style="font-size:13px;color:#9fabbf;line-height:1.4">…serve with flatbread from the <span style="color:#8fe0d2">[[Sourdough starter]]</span> discard.</span></a>'
    '<a href="#top" class="card" style="display:flex;flex-direction:column;gap:4px;padding:10px 12px;text-decoration:none"><span style="font-size:14px;font-weight:600;color:#f1f5f9">Shopping list</span><span style="font-size:13px;color:#9fabbf;line-height:1.4">Rye flour, 1 kg, for the <span style="color:#8fe0d2">[[Sourdough starter]]</span>.</span></a></div></div>'
    '<div><div class="k" style="margin-bottom:8px">In this folder</div><div style="display:flex;flex-direction:column;gap:2px"><a class="trow" href="#top">Flour types</a><a class="trow" href="#top" style="color:#5fcfbc">Sourdough starter</a><a class="trow" href="#top">Weeknight curry</a></div></div></aside></div>', 1440, 900, extra_css=DESK_CSS), 1440, 900, 2880, Y1, True, 'Desktop · reading a note')

add('Desktop-Home.dc.html', 'Desktop · home', page('Desktop, home',
    '<div style="width:1440px;height:900px;box-sizing:border-box;display:grid;grid-template-columns:264px minmax(0,1fr);background:#111a2b;overflow:hidden">' + sidebar('Home') +
    '<main style="display:flex;flex-direction:column;min-width:0;min-height:0">' + desk_top('<span style="flex-grow:1;font-size:14px;color:#9fabbf">Home</span>') +
    '<div style="flex-grow:1;overflow:hidden;padding:36px 40px 0"><div style="max-width:980px;margin:0 auto;display:flex;flex-direction:column;gap:28px">'
    '<div style="display:flex;align-items:flex-end;gap:16px">' + bird('p-look', 112, 'margin-bottom:-10px') + '<div style="display:flex;flex-direction:column;gap:8px"><h1 style="margin:0;font-family:Poppins,sans-serif;font-weight:700;font-size:34px;line-height:1.1;color:#f1f5f9;letter-spacing:-.5px">Good evening, Alex</h1><div style="padding:12px 16px;border-radius:14px;border-bottom-left-radius:4px;background:#1a2538;border:1px solid #2c3a54;font-size:16px">Three new things in your inbox and a health check from Sunday you haven\'t opened. Shall I tidy up?</div></div></div>'
    '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px">'
    + ''.join('<a href="#top" class="card" style="display:flex;flex-direction:column;gap:8px;padding:18px;text-decoration:none;color:#dfe5ee"><div style="display:flex;align-items:center;gap:8px;color:#9fabbf;font-size:13px;font-weight:600">%s%s</div><div style="font-family:Poppins,sans-serif;font-weight:700;font-size:38px;line-height:1">%s</div><div style="font-size:13px;color:#9fabbf">%s</div></a>' % (ico(i, 'width:18px;height:18px'), l, n, s) for i, l, n, s in [('inbox', 'Inbox', '3', 'waiting to be tidied'), ('chat', 'Answers', '6', 'things Bower answered'), ('heart', 'Health', '4', 'small things to fix'), ('note', 'Notes', '184', 'in your folder')]) + '</div>'
    '<div style="display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:24px">'
    '<div><div style="display:flex;align-items:baseline;justify-content:space-between;padding-bottom:8px"><h2 class="h2">Pinned</h2><span style="font-size:13px;color:#9fabbf">Drag to reorder</span></div><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:22px">' + PINS.replace('Phone-Folder.dc.html', 'Desktop-Folder.dc.html').replace('Phone-Note.dc.html', 'Desktop-Note.dc.html') + '</div>'
    '<div style="display:flex;align-items:baseline;justify-content:space-between;padding-bottom:8px"><h2 class="h2">Recent</h2><span style="font-size:13px;color:#9fabbf">Updated 4 min ago</span></div>'
    + ''.join('<a class="row" href="Desktop-Note.dc.html">%s<span style="display:flex;flex-direction:column;gap:2px;min-width:0"><span style="font-size:16px;font-weight:600">%s</span><span style="font-size:13px;color:#9fabbf">%s</span></span></a>' % (ico('note', 'color:#9fabbf'), n, m) for n, m in [('Sourdough starter', '2-Areas / Cooking · 2 h'), ('Trip to Lisbon', '1-Projects · yesterday'), ('Car insurance renewal', '2-Areas / Finance · 3 d'), ('What did I save about trip planning?', 'Answers · 5 d'), ('Kitchen hygiene', '3-Resources · 1 w')]) + '</div>'
    '<div style="display:flex;flex-direction:column;gap:12px"><h2 class="h2" style="padding-bottom:0">Tell Bower</h2>'
    '<div class="card" style="display:flex;flex-direction:column;gap:10px"><textarea placeholder="A rule, a task or a question" aria-label="Message" style="min-height:84px;padding:10px 12px;border-radius:10px;border:1px solid #2c3a54;background:#111a2b;color:#dfe5ee;font:15px/1.4 \'Source Sans 3\',sans-serif;resize:none"></textarea><div style="display:flex;justify-content:space-between;align-items:center"><div style="display:flex;gap:6px"><button type="button" class="chip">A rule</button><button type="button" class="chip">A task</button></div><button type="button" class="btn" style="min-height:38px">Send</button></div></div>'
    '<div class="card" style="display:flex;align-items:center;gap:12px">' + bird('p-idle e-happy', 40) + '<div style="font-size:14px;line-height:1.45;color:#cbd5e1">Last one: <span style="color:#f1f5f9">"File recipes under Cooking"</span>. Kept as a rule.</div></div></div></div></div></div></main></div>', 1440, 900, extra_css=DESK_CSS), 1440, 900, 4400, Y1, True, 'Desktop · home')

add('Desktop-Files.dc.html', 'Desktop · Bower\'s files shown', page('Desktop, the rulebook, Bower files shown',
    '<div style="width:1440px;height:900px;box-sizing:border-box;display:grid;grid-template-columns:264px minmax(0,1fr);background:#111a2b;overflow:hidden">' + sidebar('files', True) +
    '<main style="display:flex;flex-direction:column;min-width:0;min-height:0">' + desk_top('<nav aria-label="Folder" style="display:flex;align-items:center;gap:6px;font-size:14px;color:#9fabbf;flex-grow:1"><span>Bower\'s files</span><span aria-hidden="true">/</span><span style="color:#dfe5ee">Rulebook</span></nav>') +
    '<div style="display:flex;align-items:center;gap:12px;margin:20px 24px 0;padding:12px 16px;border-radius:12px;background:rgba(240,182,79,.1);border:1px solid rgba(240,182,79,.35);font-size:14px;color:#cbd5e1">' + bird('p-idle e-curious', 36) + '<span style="flex-grow:1;line-height:1.45">One of Bower\'s own files. It tells the bird how to file your notes. You can edit it in Drive; Bower reads it on every tidy-up.</span><a href="#top" style="color:#8fe0d2;font-weight:600;text-decoration:none;white-space:nowrap">Open in Drive</a></div>'
    '<article style="flex-grow:1;overflow:hidden;padding:28px 24px 0"><div style="max-width:720px;margin:0 auto;display:flex;flex-direction:column">'
    '<h1 style="margin:0 0 20px;font-family:Poppins,sans-serif;font-weight:700;font-size:36px;line-height:1.15;color:#f1f5f9;letter-spacing:-.5px">Rulebook</h1>'
    '<div class="dp"><p>How Bower files what you add. Plain sentences; add your own at the end.</p>'
    '<h2>Folders</h2><ul style="margin:0 0 16px;padding-left:22px"><li><span class="wl">1-Projects</span>: things with an end date.</li><li><span class="wl">2-Areas</span>: ongoing parts of life. Cooking, Finance, Home, Health.</li><li><span class="wl">3-Resources</span>: reference you may want again.</li><li><span class="wl">4-Archive</span>: done or no longer relevant.</li></ul>'
    '<h2>Your rules</h2><ul style="margin:0 0 16px;padding-left:22px"><li>File recipes under Cooking and tag them #recipe. <span style="color:#7d8aa3">(added 26 Sep from Tell Bower)</span></li><li>Receipts go to Finance, named by shop and date.</li></ul>'
    '<h2>Naming</h2><p>Title case, no dates in titles, one note per idea. Link to related notes with double brackets.</p></div></div></article></main></div>', 1440, 900, extra_css=DESK_CSS), 1440, 900, 5920, Y1, True, 'Desktop · Bower\'s files shown')

TREE = [(0, 'folder', '1-Projects', '4', False), (0, 'folder', '2-Areas', '12', True), (1, 'folder', 'Cooking', '3', True), (2, 'note', 'Flour types', '', False), (2, 'note', 'Sourdough starter', '', False), (2, 'note', 'Weeknight curry', '', False), (1, 'folder', 'Finance', '5', False), (1, 'folder', 'Health', '2', False), (1, 'folder', 'Home', '2', False), (0, 'folder', '3-Resources', '9', False), (0, 'folder', '4-Archive', '31', False), (0, 'folder', 'Answers', '6', False), (0, 'folder', 'Clippings', '8', False)]
prow = ''.join('<a class="prow" href="%s" style="padding-left:%dpx">%s%s<span style="flex-grow:1">%s</span>%s</a>' % ('Phone-Note.dc.html' if k == 'note' else '#top', 10 + d * 22, ('' if k == 'note' else ico('next', 'width:16px;height:16px;color:#7d8aa3' + (';transform:rotate(90deg)' if st else ''))), ico(k, 'color:#9fabbf'), n, ('<span style="font-size:12px;color:#7d8aa3">%s</span>' % c) if c else '') for d, k, n, c, st in TREE)
add('Phone-Files.dc.html', 'Your notes (drawer)', page('Browse your notes, phone',
    '<div style="width:390px;height:844px;box-sizing:border-box;position:relative;background:#111a2b;overflow:hidden">' + dim_home('.5') +
    '<div style="position:absolute;left:0;top:0;bottom:0;width:340px;display:flex;flex-direction:column;background:#0b1120;border-right:1px solid #2c3a54;box-shadow:16px 0 48px rgba(0,0,0,.5)">'
    '<div style="display:flex;align-items:center;gap:6px;min-height:60px;padding:8px 8px 0 16px"><span style="font-family:Poppins,sans-serif;font-weight:600;font-size:18px;color:#f1f5f9;flex-grow:1">Your notes</span>' + iconbtn('sort', 'Sort') + iconbtn('collapse', 'Collapse all') + iconbtn('x', 'Close') + '</div>'
    '<a href="Phone-Switcher.dc.html" style="display:flex;align-items:center;gap:10px;min-height:40px;margin:6px 12px 8px;padding:0 12px;border-radius:10px;background:#1a2538;border:1px solid #2c3a54;color:#7d8aa3;font-size:14px;text-decoration:none">' + ico('search', 'width:18px;height:18px') + 'Filter by name</a>'
    '<div style="flex-grow:1;overflow:hidden;padding:0 8px;display:flex;flex-direction:column;gap:2px">' + prow + '</div>'
    '<button type="button" class="prow" style="margin:8px;padding:0 10px;border:1px dashed #2c3a54;color:#7d8aa3;font-size:13px;background:none;cursor:pointer;font-family:inherit;min-height:44px">' + ico('eyeoff', 'width:18px;height:18px') + '<span style="flex-grow:1;text-align:left">Bower\'s own files and dot-folders: hidden</span><span style="color:#8fe0d2;font-weight:600">Show</span></button>'
    '<div style="display:flex;align-items:center;gap:10px;padding:10px 16px 24px;border-top:1px solid #2c3a54;font-size:13px;color:#7d8aa3">' + '<span style="flex-grow:1">you@example.com</span><a href="Login.dc.html" style="color:#9fabbf">Sign out</a></div></div></div>', 390, 844,
    extra_css='.prow{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 8px;border-radius:8px;color:#dfe5ee;text-decoration:none;font-size:15px}.prow .ico{width:20px;height:20px}'), 390, 844, X(8), Y3, True, 'Your notes (drawer)')

# ---- Row 5: the mascot ------------------------------------------------------
Y5 = 4952
POSES = [
 ('p-look', 'Looking', 'Idle everywhere: sidebar corner, top bar, Home greeting.', 'Hunting for something bright: head turns up, down and back, whole bird turns round every 11 s, tail flick. Never still, never busy.'),
 ('p-hello', 'Hello', 'Sign-in, first open of the day, after the tour.', 'Flies in with feet tucked, lands with a squash, looks at you, two chirps, one hop. Plays once.'),
 ('p-shiny', 'Shiny!', 'Search box on focus, a file over the drop zone, a link pasted.', 'Sees the gem: eye grows, leans in, wings flutter, tail wags. Bounces twice, then edges towards it.'),
 ('p-sing', 'Singing', 'Tell Bower: while you type and right after you send.', 'Head up, beak keeps the beat, three notes float off, tail wags. The bird answers you before the run does.'),
 ('p-tidy', 'Tidying up', 'After you tap Tidy up: the button and the sheet.', 'Trip one: a paper from the inbox to the nest. Trip two: a twig. The nest fills, folder names appear under it. Loops until the run ends.'),
 ('p-dance', 'Show-off', 'Run finished, tour finished, first note ever filed.', 'The bower dance: strut, deep bow with the wing spread and tail fanned, sparkles. Plays once, then Looking.'),
 ('p-confused', 'Confused', 'Run failed, note not found, not invited, 404.', 'Head tilts both ways, one wing shrugs, a question mark rises. Honest, not sad.'),
 ('p-build', 'Building', 'Onboarding while your folder is created; long first loads.', 'Twig in the beak, hops between the two walls as they go up stick by stick. Progress you can watch.'),
 ('p-sleep', 'Asleep', 'Empty inbox at night, nothing sent yet, nothing new.', 'Curled up in its nest, legs tucked, eyes shut, slow breath, two z letters drift up.'),
 ('p-peek', 'Peeking', 'Behind the drop zone on Add; behind the search box before you type.', 'Only the top of the head shows; the eye follows the caret, the head pops up now and then.'),
 ('p-offline', 'Offline', 'Offline banner, a note not saved on this device.', 'A cloud rains over its head; it shelters under its own wing, colours dimmed, lid half down. Sad, waiting for the signal.'),
 ('p-done', 'Done', 'Small wins: a file uploaded, a message sent, settings saved.', 'Wing thrown up in celebration, a jump with a crouch first, a wink, a chirp. Two seconds, then Looking. The big dance is only for big wins.'),
]
FACES = [('e-happy', 'Happy', 'jaw open · head up'), ('e-curious', 'Curious', 'eye wide · lean in'), ('e-worried', 'Worried', 'eye narrow · head down'), ('e-sleepy', 'Sleepy', 'eye shut · head tucked'), ('e-proud', 'Proud', 'chest out · tail fanned')]

mascot = ('<div style="width:1440px;height:1180px;box-sizing:border-box;padding:32px 40px;display:flex;flex-direction:column;gap:18px;background:#111a2b;overflow:hidden">'
  '<div style="display:grid;grid-template-columns:300px minmax(0,1fr);gap:18px;padding:16px 18px;border-radius:16px;background:#1a2538;border:1px solid #2c3a54">'
  '<div style="display:flex;flex-direction:column;gap:6px"><div style="font-family:Poppins,sans-serif;font-weight:700;font-size:22px;color:#f1f5f9">The bird</div><div style="font-size:13.5px;line-height:1.45;color:#9fabbf">The bird from the first review, kept: round body, a head that turns on a neck, one big eye with two highlights, the wing hinged at the shoulder. Refined today: a pill beak, three tail feathers, one long wing that lies along the body and lifts from the shoulder, a neck that stretches, an upper and a lower eyelid for mood (lower lid up = happy, upper lid down = worried or sleepy), a twig nest, softer colours.</div></div>'
  '<div style="display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px">' + ''.join('<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:10px;background:#111a2b"><div class="%s" style="height:110px;display:flex;align-items:flex-end">%s</div><div style="font-size:13px;font-weight:600;color:#f1f5f9">%s</div><div style="font-size:11.5px;color:#9fabbf;text-align:center">%s</div></div>' % (c, bird('', 100), n, d) for c, n, d in FACES) + '</div></div>'
  '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:14px;flex-grow:1;min-height:0">'
  + ''.join('<div style="display:flex;flex-direction:column;gap:6px;padding:12px;background:#1a2538;border:1px solid #2c3a54;border-radius:14px;min-height:0">'
            '<div class="%s" style="position:relative;height:150px;flex-shrink:0;display:flex;align-items:flex-end;justify-content:center;border-radius:10px;background:#111a2b;overflow:hidden">%s%s%s</div>'
            '<div style="font-family:Poppins,sans-serif;font-weight:600;font-size:15px;color:#f1f5f9">%s</div><div style="display:grid;grid-template-columns:52px minmax(0,1fr);gap:2px 8px"><div class="k">Where</div><div class="v">%s</div><div class="k">Motion</div><div class="v">%s</div></div></div>'
            % (c, ('<div style="position:absolute;left:24px;right:24px;bottom:22px;height:44px;border-radius:10px;background:#1a2538;border:1px solid #2c3a54"></div>' if c == 'p-peek' else ''),
               ('<span class="lbl" style="left:22px">Inbox</span><span class="lbl" style="right:16px">Cooking · Finance</span>' if c == 'p-tidy' else ''),
               bird('', 112, 'position:relative;margin-bottom:' + ('-34px' if c == 'p-peek' else '8px'), scene=True), n, w, m) for c, n, w, m in POSES) + '</div></div>')
add('Mascot.dc.html', 'Mascot', page('Bower mascot, character and states', mascot, 1440, 1180,
    extra_css='.v{font-size:13px;line-height:1.4;color:#cbd5e1}.lbl{position:absolute;bottom:8px;font-size:11px;color:#7d8aa3;letter-spacing:.04em}'), 1440, 1180, 0, Y5, False, 'Mascot · faces and twelve states')


# ---- Brand, logo and README boards ----------------------------------------
WORDMARK = '<span style="font-family:Poppins,sans-serif;font-weight:700;letter-spacing:-.03em;line-height:1;color:%s;font-size:%dpx">Bower</span>'
MONO_CSS = ('.mono .b .bd,.mono .b .hc,.mono .b .nk,.mono .b .ld,.mono .b .lb,.mono .b .wp,.mono .b .tf,.mono .b .bk,.mono .b .bj,.mono .b .fo,.mono .b .eh{fill:var(--m)}'
            '.mono .b .lg{stroke:var(--m)}.mono .b .ec{fill:var(--g)}.mono .b .ch,.mono .b .ck{opacity:0}')

def tile(bg, border, inner, size=88, radius=20):
    return '<div style="width:%dpx;height:%dpx;border-radius:%dpx;background:%s;border:1px solid %s;display:flex;align-items:center;justify-content:center;flex-shrink:0">%s</div>' % (size, size, radius, bg, border, inner)

brand = ('<div style="width:1440px;height:900px;box-sizing:border-box;padding:44px 48px;display:grid;grid-template-columns:430px minmax(0,1fr);gap:44px;background:#111a2b;overflow:hidden">'
  '<div style="display:flex;flex-direction:column;gap:22px">'
  '<div style="display:flex;align-items:flex-end;gap:14px">' + bird('p-look', 128, 'margin-bottom:-12px') + WORDMARK % ('#f1f5f9', 56) + '</div>'
  '<p style="margin:0;font-size:16px;line-height:1.55;color:#cbd5e1">Named after the bowerbird: twenty species, found only in Australia and New Guinea. The male builds a bower of twigs and decorates it with everything bright he can find, sorted by colour and size, to impress a visiting female. Rivals steal from each other\'s bowers.</p>'
  '<p style="margin:0;font-size:16px;line-height:1.55;color:#cbd5e1">Bower does the same with what you drop: collects it, files it with care, and shows it off to you.</p>'
  '<div style="display:flex;flex-direction:column;gap:10px"><div class="k">The mark on its grounds</div><div style="display:flex;gap:12px">'
  + tile('#ffffff', '#e3e0da', bird('', 52)) + tile('#f1efeb', '#e3e0da', bird('', 52)) + tile('#1a2538', '#2c3a54', bird('', 52)) + tile('#111a2b', '#2c3a54', bird('', 52)) +
  '</div><div style="font-size:13px;color:#7d8aa3">White, warm light, slate or navy behind it. Never on teal, amber or a photo. Facing right, flat, no outline. The mascot and the mark are the same drawing.</div></div>'
  '<div style="display:flex;flex-direction:column;gap:10px"><div class="k">Faces</div><div style="display:flex;gap:6px">' + ''.join('<div class="%s" style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">%s<span style="font-size:11px;color:#7d8aa3">%s</span></div>' % (c, bird('', 58), n) for c, n, d in FACES) + '</div></div>'
  '<div style="display:flex;flex-direction:column;gap:8px"><div class="k">Voice</div><div style="font-size:14px;line-height:1.45;color:#cbd5e1">"Your notes", "your Bower folder", never "vault". The bird speaks in first person, one short warm sentence. Errors say what to do next.</div></div>'
  '</div>'
  '<div style="display:flex;flex-direction:column;gap:22px;min-width:0">'
  '<div style="display:flex;flex-direction:column;gap:10px"><div class="k">Surfaces: dark (default) and warm light</div><div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px">'
  + ''.join('<div class="sw"><div style="background:%s%s"></div><span>%s<br><code>%s</code></span></div>' % (h, ';border:1px solid #e3e0da' if light else '', n, h) for n, h, light in [
      ('Sidebar', '#0b1120', 0), ('Page', '#111a2b', 0), ('Card, input', '#1a2538', 0), ('Hover, active', '#233049', 0), ('Border', '#2c3a54', 0), ('Text', '#dfe5ee', 0),
      ('Sidebar', '#f1efeb', 1), ('Page', '#faf9f6', 1), ('Card, input', '#ffffff', 1), ('Hover, active', '#ebe8e2', 1), ('Border', '#e3e0da', 1), ('Text', '#1c2333', 1)]) + '</div></div>'
  '<div style="display:flex;flex-direction:column;gap:10px"><div class="k">Accents, softened</div><div style="display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px">'
  + ''.join('<div class="sw"><div style="background:%s"></div><span>%s<br><code>%s</code></span></div>' % (h, n, h) for n, h in [('Teal, primary', '#5fcfbc'), ('Deep teal, links on light', '#2f9c8d'), ('Amber, badges, beak, feet', '#f0b64f'), ('Success', '#7ed3a1'), ('Danger', '#ef8a8a'), ('Nest brown', '#8a5a3b')]) + '</div></div>'
  '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:22px">'
  '<div style="display:flex;flex-direction:column;gap:10px"><div class="k">Type</div><div style="display:flex;flex-direction:column;gap:8px;padding:16px;background:#1a2538;border-radius:12px">'
  '<div style="font-family:Poppins,sans-serif;font-weight:700;font-size:28px;line-height:1.2;color:#f1f5f9">Sourdough starter</div><div style="font-size:12px;color:#7d8aa3">Poppins 700, titles and the wordmark</div>'
  '<div style="font-size:16px;line-height:1.55;color:#dfe5ee;margin-top:4px">Feed it every twelve hours until it doubles. Keep the jar at room temperature and away from the window.</div><div style="font-size:12px;color:#7d8aa3">Source Sans 3 400, body and UI</div>'
  '<div style="font-family:\'JetBrains Mono\',monospace;font-size:13px;color:#9fabbf;margin-top:4px">2-Areas/Cooking/Sourdough starter.md</div><div style="font-size:12px;color:#7d8aa3">JetBrains Mono, paths and code</div></div></div>'
  '<div style="display:flex;flex-direction:column;gap:10px"><div class="k">Controls and motion</div><div style="display:flex;flex-direction:column;gap:12px;padding:16px;background:#1a2538;border-radius:12px">'
  '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button type="button" class="pill" style="min-height:40px">Tidy up (3)</button><button type="button" class="btn2" style="min-height:40px">Refresh</button><button type="button" class="chip">A rule</button><span style="padding:2px 8px;border-radius:999px;background:#f0b64f;color:#111a2b;font-size:12px;font-weight:600">New</span></div>'
  '<div style="display:flex;align-items:center;gap:10px;min-height:40px;padding:0 12px;border-radius:10px;background:#111a2b;border:1px solid #2c3a54;color:#7d8aa3;font-size:15px">' + ico('search') + '<span style="flex-grow:1">Search or jump to a note</span><span class="kbd">Ctrl K</span></div>'
  '<div style="display:flex;gap:8px;flex-wrap:wrap"><span class="tag">#recipe</span><span class="tag">#bread</span><a href="#top" class="wl" style="font-size:15px">[[Flour types]]</a></div>'
  '<div style="display:flex;gap:10px;font-size:13px;color:#9fabbf"><div style="padding:6px 10px;border:1px solid #2c3a54;border-radius:8px"><b style="color:#dfe5ee">120 ms</b> hover, press</div><div style="padding:6px 10px;border:1px solid #2c3a54;border-radius:8px"><b style="color:#dfe5ee">200 ms</b> panels, sheets</div><div style="padding:6px 10px;border:1px solid #2c3a54;border-radius:8px"><b style="color:#dfe5ee">320 ms</b> the bird</div></div>'
  '<div style="font-size:12px;color:#7d8aa3">Ease-out in, ease-in-out for loops. Transform and opacity only. Reduced motion: the bird holds a pose.</div></div></div></div></div></div>')
add('Brand.dc.html', 'Brand sheet', page('Bower brand sheet', brand, 1440, 900, extra_css='.sw{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#9fabbf}.sw div:first-child{height:40px;border-radius:8px}code{font-family:\'JetBrains Mono\',monospace;font-size:12px;color:#9fabbf}'), 1440, 900, 0, Y1, False, 'Brand sheet')

def lockup(bg, fg, border, w, h, inner, label):
    return ('<div style="display:flex;flex-direction:column;gap:8px"><div style="width:%dpx;height:%dpx;border-radius:16px;background:%s;border:1px solid %s;display:flex;align-items:center;justify-content:center">%s</div><div style="font-size:12px;color:#9fabbf">%s</div></div>' % (w, h, bg, border, inner, label))

logo = ('<div style="width:1280px;height:760px;box-sizing:border-box;padding:40px 48px;display:flex;flex-direction:column;gap:22px;background:#111a2b;overflow:hidden">'
  '<div style="display:flex;align-items:baseline;gap:16px"><div style="font-family:Poppins,sans-serif;font-weight:700;font-size:26px;color:#f1f5f9">Logo</div><div style="font-size:15px;color:#9fabbf">The bird is the mark. The wordmark is Poppins Bold, letter-spacing -3 %, outlined in the SVG files so no font loads. Clear space: a quarter of the mark\'s height. Minimum: 24 px bare mark, 16 px on a navy square, 96 px wordmark.</div></div>'
  '<div style="display:flex;gap:22px;align-items:flex-start">'
  + lockup('#111a2b', '', '#2c3a54', 380, 150, '<div style="display:flex;align-items:center;gap:14px">' + bird('', 84) + WORDMARK % ('#f1f5f9', 52) + '</div>', 'Primary lockup, dark')
  + lockup('#faf9f6', '', '#e3e0da', 380, 150, '<div style="display:flex;align-items:center;gap:14px">' + bird('', 84) + WORDMARK % ('#111a2b', 52) + '</div>', 'Primary lockup, light')
  + lockup('#111a2b', '', '#2c3a54', 190, 150, '<div style="display:flex;flex-direction:column;align-items:center;gap:2px">' + bird('', 74) + WORDMARK % ('#f1f5f9', 26) + '</div>', 'Stacked, for square spaces')
  + lockup('#111a2b', '', '#2c3a54', 150, 150, bird('', 96), 'Mark alone')
  + '</div>'
  '<div style="display:flex;gap:22px;align-items:flex-start">'
  + lockup('transparent', '', 'transparent', 300, 150, '<div style="display:flex;align-items:center;gap:14px">' + tile('#111a2b', '#2c3a54', bird('', 74), 120, 28) + tile('#f1efeb', '#e3e0da', bird('', 74), 120, 28) + '</div>', 'App icon, PWA and home screen: navy or warm light, 22 % radius')
  + lockup('transparent', '', 'transparent', 240, 150, '<div style="display:flex;align-items:flex-end;gap:14px">' + tile('#111a2b', '#2c3a54', bird('', 40), 64, 14) + tile('#111a2b', '#2c3a54', bird('', 22), 32, 7) + tile('#111a2b', '#2c3a54', bird('', 11), 16, 4) + '</div>', 'Favicon 64, 32, 16 px')
  + lockup('transparent', '', 'transparent', 300, 150, '<div style="display:flex;align-items:center;gap:14px"><div class="mono" style="--m:#dfe5ee;--g:#111a2b">' + tile('#111a2b', '#2c3a54', bird('', 74), 120, 28) + '</div><div class="mono" style="--m:#111a2b;--g:#faf9f6">' + tile('#faf9f6', '#e3e0da', bird('', 74), 120, 28) + '</div></div>', 'One colour: print, stamps, embroidery')
  + lockup('transparent', '', 'transparent', 220, 150, '<div style="position:relative;width:150px;height:150px;display:flex;align-items:center;justify-content:center;border:1px dashed #5fcfbc;border-radius:8px"><div style="position:absolute;inset:26px;border:1px dashed #7d8aa3;border-radius:4px"></div>' + bird('', 98) + '</div>', 'Clear space: ¼ of the height on every side')
  + '</div>'
  '<div style="display:flex;flex-direction:column;gap:10px"><div class="k">Don\'t</div><div style="display:flex;gap:22px">'
  + ''.join('<div style="display:flex;flex-direction:column;gap:8px"><div style="width:150px;height:110px;border-radius:14px;background:%s;border:1px solid %s;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden">%s<span style="position:absolute;left:8px;top:6px;font-size:11px;font-weight:600;color:#ef8a8a">NO</span></div><div style="font-size:12px;color:#9fabbf">%s</div></div>' % (bg, bd, inner, lbl) for bg, bd, inner, lbl in [
      ('#5fcfbc', '#5fcfbc', bird('', 64), 'On teal or amber'),
      ('#111a2b', '#2c3a54', bird('', 64, 'transform:rotate(-24deg)'), 'Rotated or tilted'),
      ('#111a2b', '#2c3a54', '<div class="flip">' + bird('', 64) + '</div>', 'Mirrored (except when it turns round in an animation)'),
      ('#111a2b', '#2c3a54', bird('', 64, 'filter:drop-shadow(0 0 2px #fff) drop-shadow(0 0 2px #fff)'), 'Outlined, shadowed, gradient'),
      ('#111a2b', '#2c3a54', bird('', 64, 'filter:hue-rotate(120deg)'), 'Recoloured')]) + '</div></div></div>')
add('Logo.dc.html', 'Logo', page('Bower logo sheet', logo, 1280, 760, extra_css=MONO_CSS), 1280, 760, 1520, Y1, False, 'Logo: lockups, icon, favicon, one colour, clear space')

# The README, as GitHub will show it: hero, why a bowerbird, how it works,
# what makes it different, screens, engineers. The animated parts become SVG
# files (docs/design/assets.py) so GitHub plays them inside <img>.
def gh_h2(t):
    return '<h2 style="margin:36px 0 12px;padding-bottom:6px;border-bottom:1px solid #2c3a54;font-family:Poppins,sans-serif;font-weight:600;font-size:22px;color:#f1f5f9">%s</h2>' % t
def badge(l, r, c):
    return '<span style="display:inline-flex;font-size:11px;font-weight:600;border-radius:4px;overflow:hidden;font-family:\'Source Sans 3\',sans-serif"><span style="padding:2px 6px;background:#3b4a66;color:#fff">%s</span><span style="padding:2px 6px;background:%s;color:#111a2b">%s</span></span>' % (l, c, r)
def panel(b, title, bird_line, app_line):
    return ('<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 14px;border-radius:14px;background:#1a2538;border:1px solid #2c3a54;text-align:center">'
            '<div style="height:120px;display:flex;align-items:flex-end;justify-content:center">%s</div><div style="font-family:Poppins,sans-serif;font-weight:600;font-size:16px;color:#f1f5f9">%s</div>'
            '<div style="font-size:14px;line-height:1.45;color:#9fabbf">%s</div><div style="font-size:14px;line-height:1.45;color:#8fe0d2">%s</div></div>' % (b, title, bird_line, app_line))
readme = ('<div style="width:1280px;box-sizing:border-box;padding:40px 0 60px;background:#111a2b;display:flex;justify-content:center">'
  '<div style="width:900px;display:flex;flex-direction:column;font-size:16px;line-height:1.6;color:#dfe5ee">'
  '<div style="font-size:12px;color:#7d8aa3;margin-bottom:12px">docs/assets/hero.svg (animated: the bird looks around)</div>'
  '<div style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:28px 0 8px;text-align:center">' + bird('p-look', 150) + WORDMARK % ('#f1f5f9', 58) +
  '<div style="font-size:20px;color:#cbd5e1;margin-top:6px"><b style="color:#f1f5f9">A second brain that files itself.</b></div>'
  '<div style="font-size:16px;color:#9fabbf;max-width:640px">Drop a file, tap Tidy up, get a note. Your Google Drive, your notes; a Claude agent does the filing. Self-hosted, zero servers, 0 € a month.</div>'
  '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:12px">' + badge('CI', 'passing', '#7ed3a1') + badge('cost', '0 €', '#7ed3a1') + badge('agent', 'Claude Code', '#c4b5fd') + badge('runs on', 'GitHub Actions', '#93c5fd') + badge('hosted on', 'Cloudflare', '#fdba74') + badge('license', 'MIT', '#fde68a') + '</div></div>'
  + gh_h2('Why a bowerbird') +
  '<p style="margin:0 0 14px">The bowerbird lives only in Australia and New Guinea. The male spends his days collecting bright things, arranging them in front of his bower of twigs, sorted by colour and size, and then showing the whole thing off. It is the tidiest animal there is. That is the job Bower does for your notes.</p>'
  '<div style="font-size:12px;color:#7d8aa3;margin-bottom:8px">docs/assets/why.svg (animated, three panels)</div>'
  '<div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px">'
  + panel(bird('p-shiny', 110, '', scene=True), 'Collects', 'Anything bright: shells, feathers, a blue bottle cap.', 'You drop photos, PDFs, links, voice memos, thoughts. From any app, any device.')
  + panel(bird('p-tidy', 110, '', scene=True), 'Arranges', 'Every piece in its place, by colour and size, so it reads well from the entrance.', 'Tap Tidy up: each thing gets a title, tags, a folder, links to what you already have, and a note about why.')
  + panel(bird('p-dance', 110), 'Shows off', 'A dance in front of the bower, wings out.', 'Read it in the app or in Obsidian, ask questions, get answers filed under Answers.')
  + '</div>'
  + gh_h2('How it works') +
  '<div style="font-size:12px;color:#7d8aa3;margin-bottom:8px">docs/assets/how-it-works.svg (animated: inbox to nest)</div>'
  '<div style="position:relative;height:200px;border-radius:14px;background:#1a2538;border:1px solid #2c3a54;overflow:hidden"><div style="position:absolute;left:40px;right:40px;bottom:52px;height:2px;background:#2c3a54"></div>'
  '<div style="position:absolute;left:60px;bottom:22px;font-size:13px;color:#9fabbf">Your inbox</div><div style="position:absolute;right:48px;bottom:22px;font-size:13px;color:#9fabbf">Cooking · Finance · Answers</div>'
  '<div style="position:absolute;left:50%;bottom:40px;transform:translateX(-50%)">' + bird('p-tidy', 140, '', scene=True) + '</div></div>'
  '<ol style="margin:14px 0 0;padding-left:22px;display:flex;flex-direction:column;gap:6px"><li><b>Add something.</b> Drop a file, share from any app, paste a link, or type.</li><li><b>Tap Tidy up.</b> Nothing runs on a schedule. The bird wakes up in the background; you carry on.</li><li><b>It gets filed.</b> Title, tags, PARA folder, links, and a short note about what was done.</li><li><b>Read it anywhere.</b> In the app, or in Obsidian on the same folder.</li><li><b>Tell Bower how you like things.</b> Rules are kept for good; questions get answered in a note.</li></ol>'
  + gh_h2('What makes it different') +
  '<div style="display:grid;grid-template-columns:200px minmax(0,1fr);gap:8px 16px;font-size:15px">'
  + ''.join('<div style="font-weight:600;color:#f1f5f9">%s</div><div style="color:#cbd5e1">%s</div>' % kv for kv in [('Your data, your account', 'Plain Markdown in your Drive. Delete the app and the notes stay.'), ('One button', 'Add things all week, tap once.'), ('A rulebook you can read', 'The agent follows a CLAUDE.md in your folder, in plain English, with every rule you gave it, dated.'), ('Talk to it', 'Rules, tasks and questions go through the same inbox as everything else.'), ('Works offline', 'A PWA: notes cached, adding waits for signal.'), ('0 € to run', 'Cloudflare and GitHub free tiers; you bring Claude and a Drive.'), ('A bird with a job', 'It looks around when idle, peeks over the drop zone, sings while you type, carries papers to the nest while it works, and dances when it is done.')]) + '</div>'
  + gh_h2('The app') +
  '<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px">' + ''.join('<div style="display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:12px;background:#1a2538;border:1px solid #2c3a54"><div style="height:64px;display:flex;align-items:flex-end">%s</div><div style="font-weight:600;color:#f1f5f9">%s</div><div style="font-size:13px;color:#9fabbf;line-height:1.4">%s</div></div>' % (bird(p, 56), t, d) for p, t, d in [('p-look', 'Home', 'The bird tells you what is waiting.'), ('p-peek', 'Add', 'It peeks over the drop zone.'), ('p-sing', 'Tell Bower', 'It sings while you type.'), ('p-build', 'First run', 'It builds your folder in front of you, then shows you around.')]) + '</div>'
  '<p style="margin:12px 0 0;font-size:14px;color:#9fabbf">Then: architecture diagrams, cost, deploy, status and credits, as today.</p></div></div>')
_skip = lambda *a, **k: None  # the README section now lives on Site-Readme-Section.dc.html
_skip('Readme.dc.html', 'README', page('The README, as designed', readme, 1280, 1700), 1280, 1700, 0, 6372, False, 'README: hero, why a bowerbird, how it works')

# ---------------------------------------------------------------- write
for name, html in boards.items():
    with open(os.path.join(OUT, name), 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)

# The index: positions come from the committed canvas.json (the whole canvas,
# including the boards this file does not generate); this only refreshes
# size, title and flags of the boards it wrote, and appends new ones.
idx_path = os.path.join(OUT, 'canvas.json')
idx = json.load(open(idx_path, encoding='utf-8')) if os.path.exists(idx_path) else {'v': 3, 'createdOnFiles': {'v': 1, 'at': '2026-09-28T20:00:00Z'}, 'title': 'Bower App Revised', 'launch': {'view': 'canvas'}, 'pages': [], 'boards': {}, 'order': [], 'notes': {}, 'designSystems': []}
for name, e in layout.items():
    old = idx['boards'].get(name, {})
    e = dict(e); e['x'] = old.get('x', e['x']); e['y'] = old.get('y', e['y'])
    if 'expand' in old: e['expand'] = old['expand']
    idx['boards'][name] = e
idx['order'] = [n for n in idx['order'] if n in idx['boards']] + [n for n in layout if n not in idx['order']]
with open(idx_path, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(idx, f, ensure_ascii=False, indent=2)
print('wrote', len(boards), 'boards')
