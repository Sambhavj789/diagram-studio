title: Files and dependencies
direction: LR
Index [index.html] -> App [app.js]
Cli [cli.js] -> Core [core.js]
App -> Core
Tests [test-core.js] -> Core
Verify [verify.js] -> Tests
Verify -> Core
Core -> Parse [parse]
Core -> Layout [layout]
Core -> Render [renderSVG]
