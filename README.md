# Better-History

Replace the default browser history with this better history display.
The fork [approved](https://github.com/dragonofmercy/Dragon-Better-History/issues/29#issuecomment-1642174968) by the original author of the project. For which he is very grateful.


## How to compile less

Compile all less files with  
```sh
less $ProjectFileDir$/src/css/history.less $ProjectFileDir$/build/assets/application.css --clean-css="--s0 --advanced
```

## How to compile javascript

Compile all javascript files to the compile folder using this command:  
```sh
terser $FileName$ --output compiled/$FileNameWithoutExtension$.js --comments false
```

Then execute in powershell merge all file into a single javascript file:  
```pwsh
powershell Get-Content .\src\js\_merge.txt | foreach { Get-Content .\src\js\compiled\$_ } | Set-Content .\build\assets\application.js
```

If you need to add more javascript file don't forget to add it inside "_merge.txt" file.
