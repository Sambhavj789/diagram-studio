title: Text to SVG pipeline
direction: TB
group Input {
  Text [DSL text]
  Files [Example .txt files]
}
group Core {
  Parse [parse]
  Model [model]
  Layout [layout]
  Geo [geometry]
  Render [renderSVG]
}
group Output {
  Svg [SVG string]
  Browser [Browser preview]
  Png [PNG 2x]
  Cli [CLI .svg file]
}
Text -> Parse
Files -> Parse
Parse -.->|line N| Error [Error message]
Parse -> Model
Model -> Layout
Layout -> Geo
Geo -> Render
Render -> Svg
Svg -> Browser
Svg -> Cli
Browser -> Png
Error -.-> Parse : fix and retry
