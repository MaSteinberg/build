var autoNS = odkmaker.namespace.load('odkmaker.autocompletion');

;(function($){
    autoNS.cache = {};

    //Adapted from https://www.w3schools.com/howto/howto_js_autocomplete.asp
    function activateAutocompletion(inp, arr) {
        /*the autocomplete function takes two arguments,
        the text field element and an array of possible autocompleted values:*/
        var currentFocus;
        /*execute a function when someone writes in the text field:*/
        inp.addEventListener("input", function(e) {
            var a, b, i, val = this.value;
            /*close any already open lists of autocompleted values*/
            closeAllLists();
            if (!val) { return false;}
            currentFocus = -1;
            /*create a DIV element that will contain the items (values):*/
            a = document.createElement("DIV");
            a.setAttribute("id", this.id + "autocomplete-list");
            a.setAttribute("class", "autocomplete-items");
            /*append the DIV element as a child of the autocomplete container:*/
            this.parentNode.appendChild(a);
            /*for each item in the array...*/
            for (i = 0; i < arr.length; i++) {
                if(arr[i].label === null || arr[i].label === ""){
                    //We don't have a proper label so we use the value instead
                    arr[i].label = arr[i].value;
                }
                /*check if the item starts with the same letters as the text field value:*/
                if (arr[i].label.substr(0, val.length).toUpperCase() == val.toUpperCase()) {
                    /*create a DIV element for each matching element:*/
                    b = document.createElement("DIV");
                    /*make the matching letters bold:*/
                    b.innerHTML = "<strong>" + arr[i].label.substr(0, val.length) + "</strong>";
                    b.innerHTML += arr[i].label.substr(val.length);
                    /*insert a input field that will hold the current array item's value:*/
                    b.innerHTML += "<input type='hidden' value='" + arr[i].value + "'>";
                    /*execute a function when someone clicks on the item value (DIV element):*/
                        b.addEventListener("click", function(e) {
                        /*insert the value for the autocomplete text field:*/
                        inp.value = this.getElementsByTagName("input")[0].value;
                        //Trigger the input event so data-properties are updated properly
                        $(inp).trigger('input');
                        /*close the list of autocompleted values,
                        (or any other open lists of autocompleted values:*/
                        closeAllLists();
                    });
                    a.appendChild(b);
                }
            }
        });
        /*execute a function presses a key on the keyboard:*/
        inp.addEventListener("keydown", function(e) {
            var x = document.getElementById(this.id + "autocomplete-list");
            if (x) x = x.getElementsByTagName("div");
            if (e.keyCode == 40) {
                /*If the arrow DOWN key is pressed,
                increase the currentFocus variable:*/
                currentFocus++;
                /*and and make the current item more visible:*/
                addActive(x);
            } else if (e.keyCode == 38) { //up
                /*If the arrow UP key is pressed,
                decrease the currentFocus variable:*/
                currentFocus--;
                /*and and make the current item more visible:*/
                addActive(x);
            } else if (e.keyCode == 13) {
                /*If the ENTER key is pressed, prevent the form from being submitted,*/
                e.preventDefault();
                if (currentFocus > -1) {
                    /*and simulate a click on the "active" item:*/
                    if (x) x[currentFocus].click();
                }
            }
        });
        function addActive(x) {
            /*a function to classify an item as "active":*/
            if (!x) return false;
            /*start by removing the "active" class on all items:*/
            removeActive(x);
            if (currentFocus >= x.length) currentFocus = 0;
            if (currentFocus < 0) currentFocus = (x.length - 1);
            /*add class "autocomplete-active":*/
            x[currentFocus].classList.add("autocomplete-active");
        }
        function removeActive(x) {
            /*a function to remove the "active" class from all autocomplete items:*/
            for (var i = 0; i < x.length; i++) {
                x[i].classList.remove("autocomplete-active");
            }
        }
        function closeAllLists(elmnt) {
            /*close all autocomplete lists in the document,
            except the one passed as an argument:*/
            var x = document.getElementsByClassName("autocomplete-items");
            for (var i = 0; i < x.length; i++) {
                if (elmnt != x[i] && elmnt != inp) {
                    x[i].parentNode.removeChild(x[i]);
                }
            }
        }
        /*execute a function when someone clicks in the document:*/
        document.addEventListener("click", function (e) {
            closeAllLists(e.target);
        });
    } 

    $.fn.extend({
        semanticAutocompletion: function(property){
            var autocompletionArray;
            if(autoNS.cache[property]){
                autocompletionArray = getControlReferenceAutocompletion().concat(autoNS.cache[property]);
            } else{
                autocompletionArray = getControlReferenceAutocompletion();
            }
            return this.each(function(){
                activateAutocompletion(this, autocompletionArray);
            });
        }
    });

    /* Function to pull the autocompletion terms from the referenced aggregate server*/
    autoNS.getSemanticAutocompletion = function(property){
        var protocol = odkmaker.application.serverProtocol;
        var target = odkmaker.application.serverAddress;

        if(protocol && target){
            $.ajax({
                type: 'GET',
                url: protocol + '://' + target + '/semanticAutocomplete',
                data: {
                    "semanticProperty": property,
                    "prefixed": true
                },
                dataType: 'json',
                success: function(list){
                    if(list === null){
                        /*This means that we don't have a valid configuration for this property.
                        For now just don't provide autocompletion.*/
                        console.log("The configuration for property " + property + " seems to be missing or incorrect. No autocompletion can be provided.");
                        autoNS.cache[property] = [];
                    } else{
                        /*Add terms to autocompletion cache. The list might intentionally be empty!*/
                        autoNS.cache[property] = list;
                    }
                },
                error: function(jqXHR, textStatus, errorThrown ){
                    console.error("Could not get autocompletion for " + property + " " + textStatus);
                    console.error(errorThrown);
                    autoNS.cache[property] = [];
                }
            });
        }
    }

    /*Function to get a list of names of all controls currently in the workspace*/
    function getAllControlNames(){
        var controlNames = [];
        /*Not using the odkmaker.data.extract function here because it does 
        a lot more than we actually need*/
        $('.workspace .control').each(function(){
            var controlName = $(this).data('odkControl-properties').name.value;
            controlNames.push(controlName);
        });
        return controlNames;
    }


    function getControlReferenceAutocompletion(){
        var controlNames = getAllControlNames();
        var autocompletion = [];
        for(var i = 0; i < controlNames.length; i++){
            autocompletion.push({
                value: "_col_" + controlNames[i],
                label: controlNames[i] + " (Reference to question)"
            });
        }
        return autocompletion;
    }
})(jQuery);