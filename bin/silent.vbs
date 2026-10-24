Set WshShell = CreateObject("WScript.Shell")
Set args = WScript.Arguments

If args.Count > 0 Then
    cmd = """" & args(0) & """"
    For i = 1 To args.Count - 1
        cmd = cmd & " """ & args(i) & """"
    Next
    WshShell.Run cmd, 0, False
End If
